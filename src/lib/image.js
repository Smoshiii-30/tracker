// Shrink a camera photo before upload. A 1024px JPEG is plenty for
// recognising food and keeps the request small on mobile data.
export async function toJpeg(file, maxSide = 1024) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), preview: dataUrl }
  } finally {
    URL.revokeObjectURL(url)
  }
}
