import React, { useEffect, useMemo, useState } from "react"

type ImageWithFallbackProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string
  fallbackLabel?: string
}

export function ImageWithFallback(props: ImageWithFallbackProps) {
  const { src, alt, style, className, fallbackSrc, fallbackLabel, ...rest } = props
  const normalizedSrc = useMemo(() => String(src || "").trim(), [src])
  const normalizedFallback = useMemo(() => String(fallbackSrc || "").trim(), [fallbackSrc])
  const [currentSrc, setCurrentSrc] = useState(normalizedSrc)
  const [didError, setDidError] = useState(false)
  const [fallbackAttempted, setFallbackAttempted] = useState(false)

  useEffect(() => {
    setCurrentSrc(normalizedSrc)
    setDidError(!normalizedSrc)
    setFallbackAttempted(false)
  }, [normalizedSrc])

  const handleError = () => {
    if (!fallbackAttempted && normalizedFallback && currentSrc !== normalizedFallback) {
      setCurrentSrc(normalizedFallback)
      setFallbackAttempted(true)
      return
    }
    setDidError(true)
  }

  return didError ? (
    <div
      className={`inline-flex items-center justify-center bg-black/45 text-center align-middle ${className ?? ""}`}
      style={style}
    >
      <span className="px-3 text-xs text-white/70">{fallbackLabel || "Изображение недоступно"}</span>
    </div>
  ) : (
    <img src={currentSrc} alt={alt} className={className} style={style} {...rest} onError={handleError} />
  )
}
