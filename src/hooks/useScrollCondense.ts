import { useState, useEffect, useRef, useCallback } from 'react'

interface UseScrollCondenseOptions {
    /** Scroll delta threshold to trigger direction change (default: 10) */
    threshold?: number
    /** Distance from top to consider "near top" (default: 24) */
    nearTopDistance?: number
    /** Whether the feature is enabled (default: true) */
    enabled?: boolean
}

interface UseScrollCondenseReturn {
    /** True when scrolling down and not near top */
    isCondensed: boolean
    /** True when scrollY < nearTopDistance */
    isNearTop: boolean
    /** Current scroll Y position */
    scrollY: number
}

/**
 * useScrollCondense - Hook for auto-condense behavior based on scroll direction
 * 
 * Features:
 * - Detects scroll direction with hysteresis (threshold-based)
 * - Near-top detection forces expanded state
 * - Uses requestAnimationFrame for smooth performance
 * - Respects prefers-reduced-motion
 */
export function useScrollCondense(
    options: UseScrollCondenseOptions = {}
): UseScrollCondenseReturn {
    const {
        threshold = 10,
        nearTopDistance = 24,
        enabled = true,
    } = options

    const [isCondensed, setIsCondensed] = useState(false)
    const [scrollY, setScrollY] = useState(0)

    const lastScrollY = useRef(0)
    const ticking = useRef(false)

    // Check for reduced motion preference
    const prefersReducedMotion = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false

    const isNearTop = scrollY < nearTopDistance

    const updateScrollState = useCallback(() => {
        if (!enabled) return

        const currentScrollY = window.scrollY
        const delta = currentScrollY - lastScrollY.current

        setScrollY(currentScrollY)

        // Near top: always expanded
        if (currentScrollY < nearTopDistance) {
            setIsCondensed(false)
            lastScrollY.current = currentScrollY
            ticking.current = false
            return
        }

        // Apply hysteresis - only change state if delta exceeds threshold
        if (delta > threshold) {
            // Scrolling DOWN -> condense
            setIsCondensed(true)
        } else if (delta < -threshold) {
            // Scrolling UP -> expand
            setIsCondensed(false)
        }
        // If |delta| < threshold, maintain current state (hysteresis)

        lastScrollY.current = currentScrollY
        ticking.current = false
    }, [enabled, threshold, nearTopDistance])

    const handleScroll = useCallback(() => {
        if (!ticking.current) {
            if (prefersReducedMotion) {
                // Direct update without RAF for reduced motion
                updateScrollState()
            } else {
                requestAnimationFrame(updateScrollState)
            }
            ticking.current = true
        }
    }, [updateScrollState, prefersReducedMotion])

    useEffect(() => {
        if (!enabled) return

        // Initialize
        lastScrollY.current = window.scrollY
        setScrollY(window.scrollY)

        window.addEventListener('scroll', handleScroll, { passive: true })
        return () => window.removeEventListener('scroll', handleScroll)
    }, [enabled, handleScroll])

    return {
        isCondensed,
        isNearTop,
        scrollY,
    }
}
