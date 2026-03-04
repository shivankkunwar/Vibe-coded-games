# Escape Room Game Flow

## Winning Flow (With Failure Loops)

```mermaid
flowchart TD
    A[Page Load] --> B[initGame]
    B --> C[UI + World + Player Ready]
    C --> D[Intro Modal]
    D --> E[Player chooses Mode + Callsign]
    E --> F[Start Run]
    F --> G[Room 1: Find UV Panel]
    G -->|Interact UV Panel| H[Room 1 solved\nUnlock routing objective]
    H --> I[Room 2: Rotate 3 Mirrors]
    I -->|Wrong orientation| I
    I -->|Correct orientation set| J[Routing solved\nFuse added to inventory]
    J --> K[Cipher Terminal]
    K -->|Open keypad modal| L[Enter 4-digit keypad code]
    L -->|Wrong code| L
    L -->|Correct code| M[Open cipher modal]
    M --> N[Enter cipher answer]
    N -->|Wrong answer| N
    N -->|EXODUS| O[Cipher solved]
    O --> P[Room 3: Push crates onto 3 pressure plates]
    P -->|Not all active| P
    P -->|All active| Q[Director safe powered]
    Q --> R[Collect Access Card]
    R --> S[Room 4 exit protocol]
    S --> T[Select and install Fuse]
    T --> U[Select and swipe Access Card]
    U --> V[Door opens]
    V --> W[Walk through exit zone]
    W --> X[Victory + final scoring + session high score check]

    F --> Y{Timer reaches 0?}
    Y -->|Yes| Z[Game Over modal]
    Y -->|No| G

    I --> AA{Laser hit?}
    AA -->|Yes| AB[Penalty + reset to checkpoint]
    AB --> I
    AA -->|No| I

    F --> AC{Hint requested?}
    AC -->|Yes| AD[Contextual hint stage + score penalty]
    AD --> F
    AC -->|No| F
```

## Core Runtime Loop

1. `animate()` runs each frame.
1. If running and no modal: countdown timer ticks, player updates, world updates.
1. World update resolves laser hits, plate activation state, door blocking/opening, exit detection.
1. Main loop reacts with penalties, resets, objective updates, and win/lose modals.

## State Guards That Prevent Invalid Progression

1. Cipher terminal cannot be used until routing is solved.
1. Cipher modal is locked until keypad code is correct.
1. Safe cannot open until cipher solved and all 3 plates are active.
1. Fuse box requires fuse item selected in inventory.
1. Card reader requires access card selected in inventory.
