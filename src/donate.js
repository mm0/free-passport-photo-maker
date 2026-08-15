// Donation QR codes, rendered client-side with a small self-hosted library
// (no external image/QR service call — an address going out to a
// third-party API would be a mildly ironic privacy leak on a "nothing
// leaves your device" site).

import qrcode from "qrcode-generator";

const ADDRESSES = {
  btc: {
    label: "Bitcoin",
    address: "bc1qjxsmhncxr2lv5pkrst9e5gd6q2wps24evj5pd7",
    uriScheme: "bitcoin",
  },
  ltc: {
    label: "Litecoin",
    address: "ltc1qkaxnzfz8n5xkpupx8q4fx96pgea8vxj4ge8y8m",
    uriScheme: "litecoin",
  },
};

/** Render a QR code for `coin` ("btc" | "ltc") into `container` (a DOM node). */
export function renderDonateQr(coin, container) {
  const info = ADDRESSES[coin];
  const qr = qrcode(0, "M"); // type 0 = auto-detect smallest version
  qr.addData(`${info.uriScheme}:${info.address}`);
  qr.make();
  container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2 });
}

export function getAddress(coin) {
  return ADDRESSES[coin].address;
}

export function getLabel(coin) {
  return ADDRESSES[coin].label;
}
