import DOMPurify from "dompurify";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import "./style.css";

const defaultButtonLabel = "Choose HTML File";
const defaultConfirmLabel = "Convert to PDF";
const busyButtonLabel = "Converting...";
const maxExportViewportWidth = 1505;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root element not found");
}

app.innerHTML = `
  <main class="app-shell">
    <button id="file-trigger" class="file-trigger" type="button">
      ${defaultButtonLabel}
    </button>
    <input
      id="html-file-input"
      class="file-input"
      type="file"
      accept=".html,.htm,text/html"
      hidden
    />
    <p id="selection-status" class="selection-status" hidden></p>
    <button
      id="confirm-convert"
      class="confirm-button"
      type="button"
      hidden
      disabled
    >
      ${defaultConfirmLabel}
    </button>
    <p class="privacy-note">
      Files never leave your browser. Everything is processed locally on your device.
    </p>
  </main>
`;

const fileTrigger = app.querySelector<HTMLButtonElement>("#file-trigger");
const fileInput = app.querySelector<HTMLInputElement>("#html-file-input");
const appShell = app.querySelector<HTMLElement>(".app-shell");
const confirmButton = app.querySelector<HTMLButtonElement>("#confirm-convert");
const selectionStatus =
  app.querySelector<HTMLParagraphElement>("#selection-status");

if (
  !appShell ||
  !fileTrigger ||
  !fileInput ||
  !confirmButton ||
  !selectionStatus
) {
  throw new Error("File picker controls are missing");
}

const dropZone = appShell;
const uploadButton = fileTrigger;
const uploadInput = fileInput;
const convertButton = confirmButton;
const statusMessage = selectionStatus;
let pendingFile: File | null = null;
let dragDepth = 0;

uploadButton.addEventListener("click", () => {
  uploadInput.click();
});

dropZone.addEventListener("dragenter", (event) => {
  if (!hasFilePayload(event.dataTransfer)) {
    return;
  }

  event.preventDefault();
  dragDepth += 1;
  toggleDragState(true);
});

dropZone.addEventListener("dragover", (event) => {
  if (!hasFilePayload(event.dataTransfer)) {
    return;
  }

  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }

  toggleDragState(true);
});

dropZone.addEventListener("dragleave", (event) => {
  if (!hasFilePayload(event.dataTransfer)) {
    return;
  }

  event.preventDefault();

  dragDepth = Math.max(0, dragDepth - 1);

  if (dragDepth === 0) {
    toggleDragState(false);
  }
});

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dragDepth = 0;
  toggleDragState(false);

  const droppedFile = event.dataTransfer?.files?.[0];

  if (!droppedFile) {
    return;
  }

  queueSelectedFile(droppedFile);
});

uploadInput.addEventListener("change", () => {
  const selectedFile = uploadInput.files?.[0];

  if (!selectedFile) {
    return;
  }

  queueSelectedFile(selectedFile);
  uploadInput.value = "";
});

convertButton.addEventListener("click", async () => {
  if (!pendingFile) {
    return;
  }

  const fileToConvert = pendingFile;

  await convertSelectedFile(fileToConvert);
});

function queueSelectedFile(file: File): void {
  if (!isSupportedHtmlFile(file)) {
    clearPendingFile();
    window.alert("Please choose an .html or .htm file.");
    return;
  }

  pendingFile = file;
  statusMessage.hidden = false;
  statusMessage.textContent = `Ready to convert: ${file.name}`;
  syncConfirmState();
}

async function convertSelectedFile(file: File): Promise<void> {
  setBusyState(true);

  try {
    const sourceHtml = await file.text();
    const sanitizedHtml = DOMPurify.sanitize(sourceHtml, {
      FORCE_BODY: true,
      WHOLE_DOCUMENT: true,
    });
    const renderFrame = createRenderFrame();
    const captureHost = createCaptureHost(renderFrame);

    document.body.appendChild(captureHost);

    try {
      await writeRenderDocument(renderFrame, sanitizedHtml);

      const exportRoot = getExportRoot(renderFrame);
      const exportSize = await prepareFrameForExport(renderFrame);
      const exportCanvas = await html2canvas(
        exportRoot,
        buildCanvasOptions(exportSize),
      );

      saveCanvasAsPdf(exportCanvas, file.name, exportSize);
    } finally {
      captureHost.remove();
    }

    clearPendingFile();
  } catch (error) {
    console.error("Failed to convert HTML to PDF", error);
    window.alert(
      "Could not convert this HTML file. Please use a self-contained HTML file and try again.",
    );
  } finally {
    setBusyState(false);
  }
}

function setBusyState(isBusy: boolean): void {
  uploadButton.disabled = isBusy;
  uploadButton.textContent = defaultButtonLabel;
  convertButton.disabled = isBusy || pendingFile === null;
  convertButton.hidden = pendingFile === null;
  convertButton.textContent = isBusy ? busyButtonLabel : defaultConfirmLabel;
}

function syncConfirmState(): void {
  convertButton.hidden = pendingFile === null;
  convertButton.disabled = pendingFile === null;
  convertButton.textContent = defaultConfirmLabel;
}

function clearPendingFile(): void {
  pendingFile = null;
  statusMessage.hidden = true;
  statusMessage.textContent = "";
  syncConfirmState();
}

function toggleDragState(isActive: boolean): void {
  dropZone.dataset.dragging = String(isActive);
  uploadButton.dataset.dragging = String(isActive);
}

function hasFilePayload(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  return (
    dataTransfer.files.length > 0 ||
    Array.from(dataTransfer.types).includes("Files")
  );
}

function createRenderFrame(): HTMLIFrameElement {
  const renderFrame = document.createElement("iframe");
  const exportViewportWidth = Math.min(
    Math.ceil(window.innerWidth),
    maxExportViewportWidth,
  );

  renderFrame.className = "pdf-render-frame";
  renderFrame.setAttribute("aria-hidden", "true");
  renderFrame.tabIndex = -1;
  renderFrame.style.width = `${exportViewportWidth}px`;
  renderFrame.style.height = `${window.innerHeight}px`;

  return renderFrame;
}

function createCaptureHost(renderFrame: HTMLIFrameElement): HTMLElement {
  const captureHost = document.createElement("div");

  captureHost.className = "pdf-capture-host";
  captureHost.setAttribute("aria-hidden", "true");
  captureHost.append(renderFrame);

  return captureHost;
}

function buildRenderableDocument(sanitizedHtml: string): string {
  const parsedDocument = new DOMParser().parseFromString(
    sanitizedHtml,
    "text/html",
  );

  if (!parsedDocument.head.querySelector("meta[charset]")) {
    const charsetMeta = parsedDocument.createElement("meta");

    charsetMeta.setAttribute("charset", "UTF-8");
    parsedDocument.head.prepend(charsetMeta);
  }

  return `<!doctype html>\n${parsedDocument.documentElement.outerHTML}`;
}

async function writeRenderDocument(
  renderFrame: HTMLIFrameElement,
  sanitizedHtml: string,
): Promise<void> {
  const frameDocument = renderFrame.contentDocument;

  if (!frameDocument) {
    throw new Error("Could not access the export frame document.");
  }

  frameDocument.open();
  frameDocument.write(buildRenderableDocument(sanitizedHtml));
  frameDocument.close();

  await nextFrame();
}

function getExportRoot(renderFrame: HTMLIFrameElement): HTMLElement {
  const exportRoot = renderFrame.contentDocument?.documentElement;

  if (!exportRoot) {
    throw new Error("Could not resolve the export document root.");
  }

  return exportRoot;
}

async function prepareFrameForExport(
  renderFrame: HTMLIFrameElement,
): Promise<ExportSize> {
  const frameDocument = renderFrame.contentDocument;

  if (!frameDocument) {
    throw new Error("Could not access the export frame document.");
  }

  await waitForRenderReady(frameDocument);
  applyPageBackground(frameDocument);

  return measureRenderDocument(renderFrame, frameDocument);
}

function applyPageBackground(frameDocument: Document): void {
  const documentWindow = frameDocument.defaultView;

  if (!documentWindow) {
    return;
  }

  const documentElement = frameDocument.documentElement;
  const body = frameDocument.body;
  const rootStyle = documentWindow.getComputedStyle(documentElement);
  const bodyStyle = documentWindow.getComputedStyle(body);

  if (
    hasRenderedBackground(rootStyle) ||
    !hasRenderedBackground(bodyStyle) ||
    !bodyStyle.background
  ) {
    return;
  }

  documentElement.style.background = bodyStyle.background;
}

function hasRenderedBackground(computedStyle: CSSStyleDeclaration): boolean {
  const backgroundImage = computedStyle.backgroundImage ?? "";
  const backgroundColor = computedStyle.backgroundColor ?? "";

  return (
    (backgroundImage !== "" && backgroundImage !== "none") ||
    !isTransparentColor(backgroundColor)
  );
}

function isTransparentColor(color: string): boolean {
  return (
    color === "" || color === "transparent" || color === "rgba(0, 0, 0, 0)"
  );
}

function measureRenderDocument(
  renderFrame: HTMLIFrameElement,
  frameDocument: Document,
): ExportSize {
  const documentSize = measureDocumentSize(renderFrame, frameDocument);

  return {
    height: documentSize.height,
    captureHeight: documentSize.captureHeight,
    width: documentSize.width,
    windowHeight: documentSize.captureHeight,
    windowWidth: documentSize.width,
    x: 0,
    y: 0,
  };
}

function measureDocumentSize(
  renderFrame: HTMLIFrameElement,
  frameDocument: Document,
): ExportDimensions {
  const documentElement = frameDocument.documentElement;
  const body = frameDocument.body;
  const rootRect = documentElement.getBoundingClientRect();
  const bodyRect = body.getBoundingClientRect();
  const visualHeight = measureVisualPageHeight(frameDocument);
  const exportHeight = measureExportHeight(
    visualHeight,
    bodyRect,
    body.scrollHeight,
  );

  return {
    width: Math.max(
      1,
      Math.ceil(documentElement.scrollWidth),
      Math.ceil(body.scrollWidth),
      Math.ceil(rootRect.width),
      Math.ceil(bodyRect.width),
      Math.ceil(renderFrame.clientWidth),
    ),
    captureHeight: exportHeight.captureHeight,
    height: exportHeight.height,
  };
}

function measureExportHeight(
  visualHeight: number,
  bodyRect: DOMRect,
  bodyScrollHeight: number,
): ExportHeight {
  const fullHeight = Math.max(
    1,
    visualHeight,
    bodyScrollHeight,
    bodyRect.bottom,
    bodyRect.height,
  );
  const height = Math.ceil(fullHeight);

  return { captureHeight: height, height };
}

function measureVisualPageHeight(frameDocument: Document): number {
  const body = frameDocument.body;
  const documentWindow = frameDocument.defaultView;
  const bodyPadding = getBoxSpacing(body, "padding");
  const childBottoms = Array.from(body.children)
    .map((element) => {
      const rect = element.getBoundingClientRect();

      if (rect.bottom <= 0) {
        return 0;
      }

      const marginBottom = documentWindow
        ? parseCssPixels(
            documentWindow.getComputedStyle(element).marginBottom,
          )
        : 0;

      return rect.bottom + marginBottom;
    })
    .filter((bottom) => bottom > 0);

  if (childBottoms.length === 0) {
    return body.getBoundingClientRect().bottom;
  }

  return Math.max(...childBottoms) + bodyPadding.bottom;
}

function getBoxSpacing(
  element: HTMLElement,
  property: "margin" | "padding",
): BoxSpacing {
  const elementWindow = element.ownerDocument.defaultView;

  if (!elementWindow) {
    return {
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
    };
  }

  const computedStyle = elementWindow.getComputedStyle(element);
  const propertyPrefix = property === "margin" ? "margin" : "padding";

  return {
    bottom: parseCssPixels(computedStyle[`${propertyPrefix}Bottom`]),
    left: parseCssPixels(computedStyle[`${propertyPrefix}Left`]),
    right: parseCssPixels(computedStyle[`${propertyPrefix}Right`]),
    top: parseCssPixels(computedStyle[`${propertyPrefix}Top`]),
  };
}

function parseCssPixels(value: string): number {
  const pixels = Number.parseFloat(value);

  return Number.isFinite(pixels) ? pixels : 0;
}

function buildCanvasOptions(exportSize: ExportSize): CanvasExportOptions {
  return {
    backgroundColor: "#ffffff",
    height: exportSize.captureHeight,
    scale: 2,
    useCORS: true,
    width: exportSize.width,
    windowHeight: exportSize.windowHeight,
    windowWidth: exportSize.windowWidth,
    x: exportSize.x,
    y: exportSize.y,
  };
}

function saveCanvasAsPdf(
  exportCanvas: HTMLCanvasElement,
  sourceName: string,
  exportSize: ExportSize,
): void {
  const pdfDocument = new jsPDF({
    format: [exportSize.width, exportSize.height],
    hotfixes: ["px_scaling"],
    orientation:
      exportSize.width > exportSize.height ? "landscape" : "portrait",
    unit: "px",
  });
  pdfDocument.addImage(
    exportCanvas.toDataURL("image/png"),
    "PNG",
    0,
    0,
    exportSize.width,
    exportSize.height,
  );
  pdfDocument.save(toPdfFilename(sourceName));
}

async function waitForRenderReady(frameDocument: Document): Promise<void> {
  await nextFrame();

  const images = Array.from(frameDocument.images);

  await Promise.all(images.map(async (image) => waitForImageLoad(image)));
  await nextFrame();
}

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const scheduleFrame =
      window.requestAnimationFrame ??
      ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));

    scheduleFrame(() => resolve());
  });
}

function toPdfFilename(sourceName: string): string {
  const baseName = sourceName.replace(/\.[^.]+$/, "") || "document";

  return `${baseName}.pdf`;
}

function isSupportedHtmlFile(file: File): boolean {
  return file.type === "text/html" || /\.html?$/i.test(file.name);
}

interface ExportSize {
  x: number;
  y: number;
  width: number;
  height: number;
  captureHeight: number;
  windowWidth: number;
  windowHeight: number;
}

interface ExportDimensions {
  width: number;
  height: number;
  captureHeight: number;
}

interface ExportHeight {
  height: number;
  captureHeight: number;
}

interface CanvasExportOptions {
  backgroundColor: string;
  height: number;
  scale: number;
  useCORS: boolean;
  width: number;
  windowHeight: number;
  windowWidth: number;
  x: number;
  y: number;
}

interface BoxSpacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
