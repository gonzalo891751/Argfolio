import { useRef, useEffect, useCallback, useState } from 'react'

interface UseTickerScrollOptions {
    baseSpeed?: number
    pauseDuration?: number
    wheelPauseDuration?: number
    scrollAmount?: number
    /** External pause control - stops auto-scroll when true (e.g., header condensed) */
    externalPaused?: boolean
}

export function useTickerScroll(options: UseTickerScrollOptions = {}) {
    const {
        baseSpeed = 0.5,
        pauseDuration = 3000,
        wheelPauseDuration = 1000,
        scrollAmount = 280,
        externalPaused = false,
    } = options

    const viewportRef = useRef<HTMLDivElement>(null)
    const trackRef = useRef<HTMLDivElement>(null)
    const animationRef = useRef<number | null>(null)
    const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const [isPaused, setIsPaused] = useState(false)
    const [isHovering, setIsHovering] = useState(false)

    // Check for reduced motion preference
    const prefersReducedMotion = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false

    // Reset scroll position when it exceeds ~50% of track width (for infinite loop)
    const checkReset = useCallback(() => {
        const viewport = viewportRef.current
        const track = trackRef.current
        if (!viewport || !track) return

        const maxScroll = track.scrollWidth / 2
        if (viewport.scrollLeft >= maxScroll) {
            viewport.scrollLeft = 0
        }
    }, [])

    // Animation loop
    const animate = useCallback(() => {
        const viewport = viewportRef.current
        // Stop auto-scroll if paused, hovering, or externally paused (condensed mode)
        if (!viewport || isPaused || isHovering || externalPaused) {
            animationRef.current = requestAnimationFrame(animate)
            return
        }

        viewport.scrollLeft += baseSpeed
        checkReset()
        animationRef.current = requestAnimationFrame(animate)
    }, [baseSpeed, isPaused, isHovering, externalPaused, checkReset])

    // Start/stop animation
    useEffect(() => {
        if (prefersReducedMotion) return

        animationRef.current = requestAnimationFrame(animate)

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current)
            }
        }
    }, [animate, prefersReducedMotion])

    // Pause briefly then resume
    const pauseBriefly = useCallback((duration: number = pauseDuration) => {
        setIsPaused(true)

        if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current)
        }

        pauseTimeoutRef.current = setTimeout(() => {
            if (!isHovering) {
                setIsPaused(false)
            }
        }, duration)
    }, [pauseDuration, isHovering])

    // Manual scroll left
    const scrollLeft = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        pauseBriefly()
        viewport.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
    }, [scrollAmount, pauseBriefly])

    // Manual scroll right
    const scrollRight = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        pauseBriefly()
        viewport.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }, [scrollAmount, pauseBriefly])

    // Handle wheel event (convert vertical to horizontal)
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault()
        const viewport = viewportRef.current
        if (!viewport) return

        pauseBriefly(wheelPauseDuration)
        viewport.scrollLeft += e.deltaY + e.deltaX
        checkReset()
    }, [wheelPauseDuration, pauseBriefly, checkReset])

    // Hover handlers
    const handleMouseEnter = useCallback(() => {
        setIsHovering(true)
        setIsPaused(true)
    }, [])

    const handleMouseLeave = useCallback(() => {
        setIsHovering(false)
        // Resume after short delay
        pauseTimeoutRef.current = setTimeout(() => {
            setIsPaused(false)
        }, 500)
    }, [])

    // Cleanup
    useEffect(() => {
        return () => {
            if (pauseTimeoutRef.current) {
                clearTimeout(pauseTimeoutRef.current)
            }
        }
    }, [])

    return {
        viewportRef,
        trackRef,
        isPaused,
        isHovering,
        pauseBriefly,
        scrollLeft,
        scrollRight,
        handleWheel,
        handleMouseEnter,
        handleMouseLeave,
    }
}
