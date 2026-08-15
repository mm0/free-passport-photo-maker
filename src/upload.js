// File upload + drag/drop → HTMLImageElement.

export function wireUpload(inputEl, dropZoneEl, onImage, onError) {
  const handleFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      onError?.("That doesn't look like an image file.");
      return;
    }
    try {
      const img = await loadImageFile(file);
      onImage(img);
    } catch (err) {
      // Most likely cause on a failed decode: HEIC/HEIF from an iPhone,
      // which Chrome/Firefox can't decode via <img>/canvas.
      onError?.(
        "Couldn't load that image. If it's a HEIC photo from an iPhone, try " +
          "\"Take Photo\" instead, or re-save/export it as JPEG first."
      );
    }
  };

  inputEl.addEventListener("change", () => {
    if (inputEl.files?.[0]) handleFile(inputEl.files[0]);
  });

  if (dropZoneEl) {
    ["dragenter", "dragover"].forEach((evt) =>
      dropZoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZoneEl.classList.add("drag-active");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropZoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZoneEl.classList.remove("drag-active");
      })
    );
    dropZoneEl.addEventListener("drop", (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
  }
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}
