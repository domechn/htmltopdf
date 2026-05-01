import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const sanitize = vi.fn<(input: string) => string>();
  const toDataURL = vi.fn(() => "data:image/png;base64,canvas");
  const canvas = {
    height: 900,
    toDataURL,
    width: 1400,
  };
  const html2canvas =
    vi.fn<
      (
        element: HTMLElement,
        options?: Record<string, unknown>,
      ) => Promise<HTMLCanvasElement>
    >();
  const addImage = vi.fn();
  const link = vi.fn();
  const rect = vi.fn();
  const save = vi.fn();
  const setFillColor = vi.fn();
  const jsPdfInstance = {
    addImage,
    link,
    rect,
    save,
    setFillColor,
  };
  const jsPDF = vi.fn(function MockJsPDF() {
    return jsPdfInstance;
  });

  html2canvas.mockResolvedValue(canvas as unknown as HTMLCanvasElement);

  return {
    addImage,
    canvas,
    html2canvas,
    jsPDF,
    jsPdfInstance,
    link,
    rect,
    sanitize,
    save,
    setFillColor,
    toDataURL,
  };
});

vi.mock("dompurify", () => ({
  default: {
    sanitize: mocks.sanitize,
  },
}));

vi.mock("html2canvas", () => ({
  default: mocks.html2canvas,
}));

vi.mock("jspdf", () => ({
  jsPDF: mocks.jsPDF,
}));

const defaultRequestAnimationFrame = window.requestAnimationFrame;
let computedStyleOverrides = new WeakMap<
  Element,
  Partial<CSSStyleDeclaration>
>();
let computedStyleWindows = new WeakSet<object>();

describe("main app", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    computedStyleOverrides = new WeakMap<
      Element,
      Partial<CSSStyleDeclaration>
    >();
    computedStyleWindows = new WeakSet<object>();

    mocks.sanitize.mockReset();
    mocks.sanitize.mockImplementation((value) => value);
    mocks.html2canvas.mockClear();
    mocks.jsPDF.mockClear();
    mocks.addImage.mockClear();
    mocks.rect.mockClear();
    mocks.save.mockClear();
    mocks.setFillColor.mockClear();
    mocks.toDataURL.mockClear();
    mocks.html2canvas.mockResolvedValue(
      mocks.canvas as unknown as HTMLCanvasElement,
    );

    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      function scrollWidthGetter(this: HTMLElement) {
        return this.tagName === "HTML" || this.tagName === "BODY" ? 1400 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeightGetter(this: HTMLElement) {
        return this.tagName === "HTML" || this.tagName === "BODY" ? 900 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      function clientWidthGetter(this: HTMLElement) {
        return this.tagName === "IFRAME" ? 1400 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeightGetter(this: HTMLElement) {
        return this.tagName === "IFRAME" ? 900 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRectMock(this: HTMLElement) {
        if (this.tagName === "HTML" || this.tagName === "BODY") {
          return {
            bottom: 900,
            height: 900,
            left: 0,
            right: 1400,
            top: 0,
            width: 1400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: defaultRequestAnimationFrame,
    });
  });

  it("renders one upload button and a local-processing privacy note", async () => {
    await import("./main.ts");

    const chooseButton =
      document.querySelector<HTMLButtonElement>("#file-trigger");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");

    expect(chooseButton?.textContent).toContain("Choose HTML File");
    expect(confirmButton?.hidden).toBe(true);
    expect(confirmButton?.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      "Files never leave your browser",
    );
    expect(document.body.textContent).toContain("processed locally");
  });

  it("opens the file picker when the button is clicked", async () => {
    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const trigger = document.querySelector<HTMLButtonElement>("#file-trigger");

    expect(input).not.toBeNull();
    expect(trigger).not.toBeNull();

    const clickSpy = vi.spyOn(input!, "click");

    trigger!.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("queues a selected html file and waits for confirmation before downloading a pdf", async () => {
    mocks.sanitize.mockReturnValue("<section><h1>Clean HTML</h1></section>");

    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const status = document.querySelector<HTMLElement>("#selection-status");
    const file = new File(
      ["<html><body><h1>Unsafe</h1><script>alert(1)</script></body></html>"],
      "report.html",
      { type: "text/html" },
    );

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: [file],
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(status?.textContent).toContain("report.html");
    expect(confirmButton?.hidden).toBe(false);
    expect(confirmButton?.disabled).toBe(false);
    expect(mocks.sanitize).not.toHaveBeenCalled();
    expect(mocks.html2canvas).not.toHaveBeenCalled();

    confirmButton!.click();

    await vi.waitFor(() => {
      expect(mocks.sanitize).toHaveBeenCalledWith(
        "<html><body><h1>Unsafe</h1><script>alert(1)</script></body></html>",
        expect.objectContaining({
          FORCE_BODY: true,
          WHOLE_DOCUMENT: true,
        }),
      );
      expect(mocks.html2canvas).toHaveBeenCalledTimes(1);

      const [, canvasOptions] = mocks.html2canvas.mock.calls[0] ?? [];

      expect(canvasOptions).toBeDefined();

      expect(canvasOptions).toEqual(
        expect.objectContaining({
          backgroundColor: "#ffffff",
          height: expect.any(Number),
          scale: 2,
          useCORS: true,
          width: expect.any(Number),
          windowHeight: expect.any(Number),
          windowWidth: expect.any(Number),
        }),
      );
      expect(canvasOptions!.width).toBeGreaterThan(0);
      expect(canvasOptions!.height).toBeGreaterThan(0);
      expect(canvasOptions!.width).toBe(canvasOptions!.windowWidth);
      expect(canvasOptions!.height).toBe(canvasOptions!.windowHeight);
      expect(mocks.jsPDF).toHaveBeenCalledWith(
        expect.objectContaining({
          format: [canvasOptions!.width, canvasOptions!.height],
          hotfixes: ["px_scaling"],
          unit: "px",
        }),
      );
      expect(mocks.addImage).toHaveBeenCalledTimes(1);
      expect(mocks.save).toHaveBeenCalledWith("report.pdf");
    });

    const [renderTarget] = mocks.html2canvas.mock.calls[0] ?? [];

    expect(renderTarget?.nodeType).toBe(Node.ELEMENT_NODE);
    expect(renderTarget.tagName).toBe("HTML");
  });

  it("keeps the pdf render target inside a capture host while exporting", async () => {
    mocks.sanitize.mockReturnValue("<section><p>Capture Host</p></section>");

    let resolveCanvas: ((canvas: HTMLCanvasElement) => void) | undefined;

    mocks.html2canvas.mockImplementationOnce(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          resolveCanvas = resolve;
        }),
    );

    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const file = new File(
      ["<html><body><p>Visible export</p></body></html>"],
      "capture.html",
      {
        type: "text/html",
      },
    );

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: [file],
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));

    confirmButton!.click();

    await vi.waitFor(() => {
      expect(mocks.html2canvas).toHaveBeenCalledTimes(1);
    });

    const [renderTarget] = mocks.html2canvas.mock.calls[0] ?? [];
    const exportFrame = renderTarget.ownerDocument.defaultView?.frameElement;
    const captureHost = exportFrame?.parentElement;

    expect(renderTarget.tagName).toBe("HTML");
    expect(captureHost).toBeInstanceOf(HTMLElement);
    expect(captureHost).not.toBe(document.body);
    expect(captureHost?.className).toContain("pdf-capture-host");
    expect(document.body.contains(captureHost!)).toBe(true);
    expect(exportFrame?.tagName).toBe("IFRAME");

    resolveCanvas?.(mocks.canvas as unknown as HTMLCanvasElement);

    await vi.waitFor(() => {
      expect(captureHost?.isConnected).toBe(false);
    });
  });

  it("preserves white padding rendered by the source html", async () => {
    mocks.sanitize.mockReturnValue("<section><p>Padded PDF</p></section>");
    const flushAnimationFrames = controlAnimationFrames();

    const sourceWidth = 4;
    const sourceHeight = 6;
    const pixelData = new Uint8ClampedArray(sourceWidth * sourceHeight * 4);

    for (let row = 0; row < sourceHeight; row += 1) {
      for (let column = 0; column < sourceWidth; column += 1) {
        const pixelOffset = (row * sourceWidth + column) * 4;
        const isContentRow = row >= 2 && row <= 3;
        const color = isContentRow ? 32 : 255;

        pixelData[pixelOffset] = color;
        pixelData[pixelOffset + 1] = color;
        pixelData[pixelOffset + 2] = color;
        pixelData[pixelOffset + 3] = 255;
      }
    }

    const sourceCanvas = {
      getContext: vi.fn(() => ({
        getImageData: vi.fn(() => ({
          data: pixelData,
          height: sourceHeight,
          width: sourceWidth,
        })),
      })),
      height: sourceHeight,
      toDataURL: vi.fn(() => "data:image/png;base64,uncropped"),
      width: sourceWidth,
    };
    const drawImage = vi.fn();
    const unexpectedCroppedCanvas = {
      getContext: vi.fn(() => ({
        drawImage,
      })),
      height: 0,
      toDataURL: vi.fn(() => "data:image/png;base64,cropped"),
      width: 0,
    };
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      if (tagName.toLowerCase() === "canvas") {
        return unexpectedCroppedCanvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName, options);
    }) as typeof document.createElement);
    mocks.html2canvas.mockResolvedValueOnce(
      sourceCanvas as unknown as HTMLCanvasElement,
    );

    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const file = new File(
      ["<html><body><p>Keep my padding</p></body></html>"],
      "padding.html",
      {
        type: "text/html",
      },
    );

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: [file],
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));
    confirmButton!.click();

    await setExportDocumentSize(1400, 900);
    flushAnimationFrames();

    await vi.waitFor(() => {
      flushAnimationFrames();
      expect(mocks.save).toHaveBeenCalledWith("padding.pdf");
    });

    expect(drawImage).not.toHaveBeenCalled();
    expect(unexpectedCroppedCanvas.toDataURL).not.toHaveBeenCalled();
    expect(sourceCanvas.toDataURL).toHaveBeenCalledWith("image/png");
    expect(mocks.jsPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        format: [1400, 900],
        unit: "px",
      }),
    );
    expect(mocks.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,uncropped",
      "PNG",
      0,
      0,
      1400,
      900,
    );
  });

  it("uses document content height instead of iframe viewport height", async () => {
    mocks.sanitize.mockReturnValue("<section><p>Short PDF</p></section>");
    const flushAnimationFrames = controlAnimationFrames();

    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const file = new File(
      ["<html><body><p>Short document</p></body></html>"],
      "short.html",
      {
        type: "text/html",
      },
    );

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: [file],
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));
    confirmButton!.click();

    await setExportDocumentSize(1400, 320);
    flushAnimationFrames();

    await vi.waitFor(() => {
      flushAnimationFrames();
      expect(mocks.save).toHaveBeenCalledWith("short.pdf");
    });

    const [, canvasOptions] = mocks.html2canvas.mock.calls[0] ?? [];

    expect(canvasOptions).toEqual(
      expect.objectContaining({
        height: 320,
        windowHeight: 320,
      }),
    );
    expect(mocks.jsPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        format: [1400, 320],
        unit: "px",
      }),
    );
  });

  it("exports the full page viewport without the trailing collapsed margin", async () => {
    mocks.sanitize.mockReturnValue(
      '<main class="page"><section class="header">Resume</section></main>',
    );
    const flushAnimationFrames = controlAnimationFrames();

    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const file = new File(
      ["<html><body><main class='page'>Resume</main></body></html>"],
      "resume.html",
      {
        type: "text/html",
      },
    );

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: [file],
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));
    confirmButton!.click();

    const exportDocument = await waitForExportDocument();

    setElementSize(exportDocument.documentElement, 1505, 2566);
    setElementSize(exportDocument.body, 1505, 2502, {
      computedStyle: {
        background:
          "radial-gradient(circle at 10% 10%, rgb(209, 250, 229), transparent 40%), rgb(244, 247, 251)",
        backgroundColor: "rgb(244, 247, 251)",
        backgroundImage:
          "radial-gradient(circle at 10% 10%, rgb(209, 250, 229), transparent 40%)",
      },
      top: 32,
    });

    const pageElement = exportDocument.querySelector<HTMLElement>(".page");

    expect(pageElement).not.toBeNull();
    setElementSize(pageElement!, 1100, 2502, {
      computedStyle: {
        borderBottomLeftRadius: "20px",
        borderBottomRightRadius: "20px",
      },
      left: 202,
      top: 32,
    });
    flushAnimationFrames();

    await vi.waitFor(() => {
      flushAnimationFrames();
      expect(mocks.save).toHaveBeenCalledWith("resume.pdf");
    });

    const [, canvasOptions] = mocks.html2canvas.mock.calls[0] ?? [];
    const [renderTarget] = mocks.html2canvas.mock.calls[0] ?? [];

    expect(canvasOptions).toEqual(
      expect.objectContaining({
        height: 2534,
        width: 1505,
        windowHeight: 2534,
        windowWidth: 1505,
        x: 0,
        y: 0,
      }),
    );
    expect(renderTarget.style.background).toContain("radial-gradient");
    expect(mocks.jsPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        format: [1505, 2534],
        unit: "px",
      }),
    );
    expect(mocks.addImage).toHaveBeenCalledWith(
      "data:image/png;base64,canvas",
      "PNG",
      0,
      0,
      1505,
      2534,
    );
  });

  it("keeps body padding inside the exported bounds", async () => {
    mocks.sanitize.mockReturnValue("<section><p>Body padding</p></section>");
    const flushAnimationFrames = controlAnimationFrames();

    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const file = new File(
      ["<html><body><section><p>Body padding</p></section></body></html>"],
      "body-padding.html",
      {
        type: "text/html",
      },
    );

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: [file],
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));
    confirmButton!.click();

    const exportDocument = await waitForExportDocument();

    setElementSize(exportDocument.documentElement, 900, 500);
    setElementSize(exportDocument.body, 900, 500, {
      computedStyle: {
        paddingBottom: "40px",
        paddingLeft: "40px",
        paddingRight: "40px",
        paddingTop: "40px",
      },
    });

    const section = exportDocument.querySelector<HTMLElement>("section");

    expect(section).not.toBeNull();
    setElementSize(section!, 820, 420, {
      left: 40,
      top: 40,
    });
    flushAnimationFrames();

    await vi.waitFor(() => {
      flushAnimationFrames();
      expect(mocks.save).toHaveBeenCalledWith("body-padding.pdf");
    });

    const [, canvasOptions] = mocks.html2canvas.mock.calls[0] ?? [];

    expect(canvasOptions).toEqual(
      expect.objectContaining({
        height: 500,
        width: 1400,
        x: 0,
        y: 0,
      }),
    );
    expect(mocks.jsPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        format: [1400, 500],
      }),
    );
  });

  it("queues a dropped html file and downloads a pdf after confirmation", async () => {
    mocks.sanitize.mockReturnValue("<article><p>Dropped HTML</p></article>");

    await import("./main.ts");

    const trigger = document.querySelector<HTMLButtonElement>("#file-trigger");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const file = new File(
      ["<html><body><p>Drop me</p></body></html>"],
      "drop.html",
      {
        type: "text/html",
      },
    );
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });

    Object.defineProperty(dropEvent, "dataTransfer", {
      configurable: true,
      value: {
        files: [file],
      },
    });

    trigger!.dispatchEvent(dropEvent);

    expect(confirmButton?.hidden).toBe(false);
    expect(mocks.html2canvas).not.toHaveBeenCalled();

    confirmButton!.click();

    await vi.waitFor(() => {
      expect(mocks.sanitize).toHaveBeenCalledWith(
        "<html><body><p>Drop me</p></body></html>",
        expect.objectContaining({
          FORCE_BODY: true,
          WHOLE_DOCUMENT: true,
        }),
      );
      expect(mocks.jsPDF).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.any(Array),
          unit: "px",
        }),
      );
      expect(mocks.save).toHaveBeenCalledWith("drop.pdf");
    });
  });

  it("queues an html file dropped anywhere on the page and downloads a pdf after confirmation", async () => {
    mocks.sanitize.mockReturnValue("<article><p>Page Drop</p></article>");

    await import("./main.ts");

    const shell = document.querySelector<HTMLElement>(".app-shell");
    const confirmButton =
      document.querySelector<HTMLButtonElement>("#confirm-convert");
    const file = new File(
      ["<html><body><p>Drop anywhere</p></body></html>"],
      "page-drop.html",
      {
        type: "text/html",
      },
    );
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true });

    Object.defineProperty(dropEvent, "dataTransfer", {
      configurable: true,
      value: {
        files: [file],
      },
    });

    shell!.dispatchEvent(dropEvent);

    expect(confirmButton?.hidden).toBe(false);
    expect(mocks.html2canvas).not.toHaveBeenCalled();

    confirmButton!.click();

    await vi.waitFor(() => {
      expect(mocks.sanitize).toHaveBeenCalledWith(
        "<html><body><p>Drop anywhere</p></body></html>",
        expect.objectContaining({
          FORCE_BODY: true,
          WHOLE_DOCUMENT: true,
        }),
      );
      expect(mocks.jsPDF).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.any(Array),
          unit: "px",
        }),
      );
      expect(mocks.save).toHaveBeenCalledWith("page-drop.pdf");
    });
  });

  it("rejects non-html files before starting conversion", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    await import("./main.ts");

    const input = document.querySelector<HTMLInputElement>("#html-file-input");
    const file = new File(["plain text"], "notes.txt", { type: "text/plain" });

    Object.defineProperty(input!, "files", {
      configurable: true,
      value: [file],
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Please choose an .html or .htm file.",
      );
    });

    expect(mocks.sanitize).not.toHaveBeenCalled();
    expect(mocks.html2canvas).not.toHaveBeenCalled();
  });
});

function controlAnimationFrames(): () => void {
  const callbacks: FrameRequestCallback[] = [];

  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);

      return callbacks.length;
    }),
  });

  return () => {
    while (callbacks.length > 0) {
      callbacks.shift()?.(performance.now());
    }
  };
}

async function setExportDocumentSize(
  width: number,
  height: number,
): Promise<void> {
  const exportDocument = await waitForExportDocument();

  setElementSize(exportDocument.documentElement, width, height);
  setElementSize(exportDocument.body, width, height);
}

async function waitForExportDocument(): Promise<Document> {
  await vi.waitFor(() => {
    expect(getExportDocument()).not.toBeNull();
  });

  const exportDocument = getExportDocument();

  if (!exportDocument) {
    throw new Error("Export document was not created");
  }

  return exportDocument;
}

function getExportDocument(): Document | null {
  return (
    document.querySelector<HTMLIFrameElement>(".pdf-render-frame")
      ?.contentDocument ?? null
  );
}

function setElementSize(
  element: HTMLElement,
  width: number,
  height: number,
  options: ElementSizeOptions = {},
): void {
  const left = options.left ?? 0;
  const top = options.top ?? 0;

  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: height,
  });
  element.getBoundingClientRect = vi.fn(
    () =>
      ({
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect,
  );

  if (options.computedStyle) {
    computedStyleOverrides.set(element, options.computedStyle);

    const documentWindow = element.ownerDocument.defaultView;

    if (documentWindow && !computedStyleWindows.has(documentWindow)) {
      computedStyleWindows.add(documentWindow);

      vi.spyOn(documentWindow, "getComputedStyle").mockImplementation(
        (targetElement: Element) => {
          const style = computedStyleOverrides.get(targetElement) ?? {};

          return {
            marginBottom: "0px",
            marginLeft: "0px",
            marginRight: "0px",
            marginTop: "0px",
            paddingBottom: "0px",
            paddingLeft: "0px",
            paddingRight: "0px",
            paddingTop: "0px",
            ...style,
          } as CSSStyleDeclaration;
        },
      );
    }
  }
}

interface ElementSizeOptions {
  left?: number;
  top?: number;
  computedStyle?: Partial<CSSStyleDeclaration>;
}
