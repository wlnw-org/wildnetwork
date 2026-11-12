/** A Wikimedia Commons original resized by Wikimedia itself (an original is often 1 to 5 MB; 960 px is about 120 KB). */
export function commonsThumb(url: string, width = 960) {
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp))$/i.exec(url);
  return m ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${width}px-${m[3]}` : url;
}
