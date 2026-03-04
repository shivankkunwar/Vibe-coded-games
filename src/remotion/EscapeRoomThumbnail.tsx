import React from "react";
import {
    AbsoluteFill,
    Sequence,
    useCurrentFrame,
    useVideoConfig,
    interpolate,
    spring,
    Easing,
} from "remotion";

// ─── Floating Particle ───────────────────────────────
const Particle: React.FC<{
    x: number;
    y: number;
    size: number;
    delay: number;
    color: string;
}> = ({ x, y, size, delay, color }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const progress = interpolate(frame - delay, [0, 4 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const opacity = interpolate(
        progress,
        [0, 0.2, 0.8, 1],
        [0, 0.6, 0.6, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );

    const translateY = interpolate(progress, [0, 1], [0, -40]);
    const translateX = interpolate(progress, [0, 1], [0, Math.sin(x) * 15]);

    return (
        <div
            style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                borderRadius: "50%",
                background: color,
                opacity,
                transform: `translate(${translateX}px, ${translateY}px)`,
            }}
        />
    );
};

// ─── Glowing Icon ────────────────────────────────────
const GlowingIcon: React.FC<{
    emoji: string;
    x: number;
    y: number;
    delay: number;
    size?: number;
}> = ({ emoji, x, y, delay, size = 48 }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const entrance = spring({
        frame,
        fps,
        delay,
        config: { damping: 8 },
    });

    const scale = interpolate(entrance, [0, 1], [0, 1]);
    const floatY = interpolate(
        frame,
        [0, 2 * fps, 4 * fps],
        [0, -6, 0],
        { extrapolateRight: "clamp" }
    );

    const glowOpacity = interpolate(
        frame,
        [0, 1.5 * fps, 3 * fps, 4.5 * fps],
        [0.3, 0.8, 0.3, 0.8],
        { extrapolateRight: "clamp" }
    );

    return (
        <div
            style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                fontSize: size,
                transform: `scale(${scale}) translateY(${floatY}px)`,
                filter: `drop-shadow(0 0 ${12 * glowOpacity}px rgba(6, 182, 212, ${glowOpacity}))`,
                zIndex: 5,
            }}
        >
            {emoji}
        </div>
    );
};

// ─── Main Composition ────────────────────────────────
export const EscapeRoomThumbnail: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();

    // ── Background vignette pulse ──
    const vignetteOpacity = interpolate(
        frame,
        [0, 2 * fps, 4 * fps],
        [0.7, 0.5, 0.7],
        { extrapolateRight: "clamp" }
    );

    // ── Title animation ──
    const titleSpring = spring({
        frame,
        fps,
        delay: 8,
        config: { damping: 12, stiffness: 100 },
    });
    const titleY = interpolate(titleSpring, [0, 1], [60, 0]);
    const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1]);

    // ── Subtitle animation ──
    const subtitleSpring = spring({
        frame,
        fps,
        delay: 20,
        config: { damping: 200 },
    });
    const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1]);
    const subtitleY = interpolate(subtitleSpring, [0, 1], [30, 0]);

    // ── Timer animation ──
    const timerSpring = spring({
        frame,
        fps,
        delay: 30,
        config: { damping: 15, stiffness: 200 },
    });
    const timerScale = interpolate(timerSpring, [0, 1], [0, 1]);

    // Countdown effect
    const countdownSeconds = interpolate(
        frame,
        [30, durationInFrames],
        [300, 247],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
    const mins = Math.floor(countdownSeconds / 60);
    const secs = Math.floor(countdownSeconds % 60);
    const timerText = `${mins}:${secs.toString().padStart(2, "0")}`;

    // ── Scan line effect ──
    const scanLineY = interpolate(
        frame,
        [0, durationInFrames],
        [-10, 110],
        { extrapolateRight: "clamp" }
    );

    // ── Bottom tag animation ──
    const tagSpring = spring({
        frame,
        fps,
        delay: 40,
        config: { damping: 200 },
    });
    const tagOpacity = interpolate(tagSpring, [0, 1], [0, 1]);

    // ── Code reveal typing effect ──
    const codeText = "7 2 9 4";
    const codeChars = interpolate(frame, [50, 80], [0, codeText.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });
    const visibleCode = codeText.slice(0, Math.floor(codeChars));

    // ── Cipher text ──
    const cipherSpring = spring({
        frame,
        fps,
        delay: 60,
        config: { damping: 200 },
    });

    // Particles data
    const particles = Array.from({ length: 25 }, (_, i) => ({
        x: (i * 37 + 13) % 100,
        y: 20 + ((i * 23 + 7) % 60),
        size: 2 + (i % 3),
        delay: i * 3,
        color:
            i % 3 === 0
                ? "rgba(6, 182, 212, 0.5)"
                : i % 3 === 1
                    ? "rgba(167, 139, 250, 0.4)"
                    : "rgba(251, 191, 36, 0.3)",
    }));

    return (
        <AbsoluteFill
            style={{
                background: "linear-gradient(135deg, #0a0a14 0%, #0f172a 40%, #0a0a14 100%)",
                fontFamily:
                    "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                overflow: "hidden",
            }}
        >
            {/* Vignette overlay */}
            <AbsoluteFill
                style={{
                    background:
                        "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)",
                    opacity: vignetteOpacity,
                }}
            />

            {/* Grid pattern */}
            <AbsoluteFill
                style={{
                    backgroundImage:
                        "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
                    backgroundSize: "30px 30px",
                    opacity: 0.6,
                }}
            />

            {/* Scan line */}
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: `${scanLineY}%`,
                    height: 2,
                    background:
                        "linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.15), transparent)",
                    zIndex: 10,
                }}
            />

            {/* Particles */}
            <Sequence premountFor={fps}>
                {particles.map((p, i) => (
                    <Particle key={i} {...p} />
                ))}
            </Sequence>

            {/* Glowing icons */}
            <Sequence premountFor={fps}>
                <GlowingIcon emoji="🔬" x={8} y={18} delay={15} size={56} />
                <GlowingIcon emoji="🔦" x={82} y={22} delay={25} />
                <GlowingIcon emoji="🔐" x={12} y={62} delay={35} />
                <GlowingIcon emoji="⚡" x={85} y={58} delay={45} size={42} />
                <GlowingIcon emoji="🚪" x={75} y={72} delay={55} size={40} />
            </Sequence>

            {/* Center content */}
            <AbsoluteFill
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 20,
                }}
            >
                {/* Timer badge */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 20px",
                        background: "rgba(239, 68, 68, 0.15)",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: 24,
                        marginBottom: 20,
                        transform: `scale(${timerScale})`,
                    }}
                >
                    <span style={{ fontSize: 16 }}>⏰</span>
                    <span
                        style={{
                            color: "#fca5a5",
                            fontSize: 18,
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            fontVariantNumeric: "tabular-nums",
                        }}
                    >
                        {timerText}
                    </span>
                </div>

                {/* Title */}
                <h1
                    style={{
                        fontSize: 82,
                        fontWeight: 700,
                        color: "#f1f5f9",
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                        textAlign: "center",
                        opacity: titleOpacity,
                        transform: `translateY(${titleY}px)`,
                        textShadow: "0 4px 30px rgba(6, 182, 212, 0.3)",
                        margin: 0,
                    }}
                >
                    The Forgotten Lab
                </h1>

                {/* Subtitle */}
                <p
                    style={{
                        fontSize: 26,
                        color: "#94a3b8",
                        marginTop: 16,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase" as const,
                        opacity: subtitleOpacity,
                        transform: `translateY(${subtitleY}px)`,
                    }}
                >
                    Solve puzzles. Find clues. Escape.
                </p>

                {/* Code + Cipher row */}
                <div
                    style={{
                        display: "flex",
                        gap: 40,
                        marginTop: 32,
                        alignItems: "center",
                    }}
                >
                    {/* Keypad code */}
                    <div
                        style={{
                            padding: "10px 24px",
                            background: "rgba(6, 182, 212, 0.1)",
                            border: "1px solid rgba(6, 182, 212, 0.25)",
                            borderRadius: 12,
                            opacity: interpolate(frame, [50, 60], [0, 1], {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }),
                        }}
                    >
                        <span
                            style={{
                                color: "#06b6d4",
                                fontSize: 32,
                                fontWeight: 700,
                                letterSpacing: "0.3em",
                                fontFamily: "monospace",
                            }}
                        >
                            {visibleCode}
                            <span
                                style={{
                                    opacity: frame % 20 < 10 ? 1 : 0,
                                    color: "#06b6d4",
                                }}
                            >
                                _
                            </span>
                        </span>
                    </div>

                    {/* Cipher text */}
                    <div
                        style={{
                            padding: "10px 24px",
                            background: "rgba(251, 191, 36, 0.08)",
                            border: "1px solid rgba(251, 191, 36, 0.2)",
                            borderRadius: 12,
                            opacity: interpolate(cipherSpring, [0, 1], [0, 1]),
                            transform: `scale(${interpolate(cipherSpring, [0, 1], [0.8, 1])})`,
                        }}
                    >
                        <span
                            style={{
                                color: "#fbbf24",
                                fontSize: 28,
                                fontWeight: 700,
                                letterSpacing: "0.25em",
                                fontFamily: "monospace",
                            }}
                        >
                            HARGXV → ?
                        </span>
                    </div>
                </div>
            </AbsoluteFill>

            {/* Bottom tag */}
            <div
                style={{
                    position: "absolute",
                    bottom: 36,
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    gap: 12,
                    alignItems: "center",
                    opacity: tagOpacity,
                    zIndex: 20,
                }}
            >
                <span
                    style={{
                        padding: "6px 16px",
                        background: "rgba(6, 182, 212, 0.12)",
                        border: "1px solid rgba(6, 182, 212, 0.25)",
                        borderRadius: 20,
                        color: "#67e8f9",
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase" as const,
                    }}
                >
                    ESCAPE ROOM
                </span>
                <span
                    style={{
                        padding: "6px 16px",
                        background: "rgba(167, 139, 250, 0.1)",
                        border: "1px solid rgba(167, 139, 250, 0.2)",
                        borderRadius: 20,
                        color: "#c4b5fd",
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase" as const,
                    }}
                >
                    4 ROOMS
                </span>
                <span
                    style={{
                        padding: "6px 16px",
                        background: "rgba(16, 185, 129, 0.1)",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                        borderRadius: 20,
                        color: "#6ee7b7",
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase" as const,
                    }}
                >
                    PLAY FREE
                </span>
            </div>

            {/* Top-left branding */}
            <div
                style={{
                    position: "absolute",
                    top: 28,
                    left: 32,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    opacity: interpolate(frame, [0, 15], [0, 0.6], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                    }),
                    zIndex: 20,
                }}
            >
                <span style={{ color: "#64748b", fontSize: 14, fontWeight: 500 }}>
                    shvnk.in
                </span>
                <span style={{ color: "#334155", fontSize: 16 }}>/</span>
                <span style={{ color: "#94a3b8", fontSize: 14, fontWeight: 600 }}>
                    games
                </span>
            </div>
        </AbsoluteFill>
    );
};
