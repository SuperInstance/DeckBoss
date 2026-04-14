# DECKBOSS OS: The Agent-Centric Operating System
## A Vision for Embodied Intelligence at the Edge

```
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║  DECKBOSS OS: Where every device is a ship,              ║
  ║  every agent is crew,                                    ║
  ║  and the MUD is reality.                                 ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
```

## 1. THE BOOT PROCESS: From Silicon to Squadron

```
┌─────────────────────────────────────────────────────────────┐
│  [HARDWARE]                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │   Pi    │  │ Jetson  │  │  Drone  │  │  Cloud  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │             │            │            │             │
│  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐        │
│  │  ZIG    │  │  ZIG    │  │  ZIG    │  │  ZIG    │        │
│  │BOOTLOADR│  │BOOTLOADR│  │BOOTLOADR│  │BOOTLOADR│        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │             │            │            │             │
│  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐        │
│  │  RUST   │  │  RUST   │  │  RUST   │  │  RUST   │        │
│  │ KERNEL  │  │ KERNEL  │  │ KERNEL  │  │ KERNEL  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │             │            │            │             │
│  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐        │
│  │   GO    │  │   GO    │  │   GO    │  │   GO    │        │
│  │   INIT  │  │   INIT  │  │   INIT  │  │   INIT  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │             │            │            │             │
│  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐        │
│  │  MUD    │  │  MUD    │  │  MUD    │  │  MUD    │        │
│  │  SHELL  │  │  SHELL  │  │  SHELL  │  │  SHELL  │        │
│  │ (PID 1) │  │ (PID 1) │  │ (PID 1) │  │ (PID 1) │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │             │            │            │             │
│  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐        │
│  │ AGENT   │  │ AGENT   │  │ AGENT   │  │ AGENT   │        │
│  │SPAWNING │  │SPAWNING │  │SPAWNING │  │SPAWNING │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│                                                             │
│  Each agent boots into its own WASM sandbox                 │
│  Capabilities requested via manifest.toml                   │
│  MUD interface starts FIRST - the ship is ALWAYS awake      │
└─────────────────────────────────────────────────────────────┘
```

**Boot Sequence:**
1. **Zig Bootloader**: Minimal, secure, verifiable. Measures kernel hash against hardware TPM.
2. **Rust Kernel**: Microkernel architecture. Agent scheduler initializes.
3. **Go Init System**: `deckboss-init` spawns core services and the MUD shell.
4. **Agent Spawning**: Each agent's WASM module loads with declared capabilities.
5. **MUD Awakens**: You appear on the bridge. The ship is yours.

## 2. THE KERNEL (Rust): Agent-Centric Architecture

### Agent Scheduler
```
┌─────────────────────────────────────────────────────────────┐
│  AGENT SCHEDULER                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Priority Queue                                      │   │
│  │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │   │
│  │ │Nav  │ │Cam  │ │Comms│ │Power│ │Sensor│            │   │
│  │ │Agent│ │Agent│ │Agent│ │Agent│ │Agent│            │   │
│  │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  Each agent:                                               │
│  • Has capability tags (camera_access, motor_control)      │
│  • Declares urgency (0-100)                                │
│  • Can be preempted by higher-urgency agents               │
│  • Shares CPU fairly within priority bands                 │
└─────────────────────────────────────────────────────────────┘
```

### Git-Native Filesystem: `gitfs`
Every file operation is a commit. Every directory is a branch.
```
/ship/logs/navigation/2024-01-15.log
  ├── commit: a1b2c3d "Added GPS fix at 14:32"
  ├── commit: e4f5g6h "Course correction to 245°"
  └── commit: i7j8k9l "Arrived at waypoint Delta"

$ cd /ship/sensors
$ git log --oneline
a1b2c3d Camera: Object detected (human, 95% confidence)
b2c3d4e Lidar: Obstacle at 15m
c3d4e5f Thermal: Heat signature detected
```

### Capability-Based Security
Agents declare needs in `manifest.toml`:
```toml
[agent.navigator]
capabilities = [
  "gps.read",
  "motor.control",
  "network.lora",
  "storage.logs.write"
]

urgency = 75  # High priority - keeps us from crashing
```

### Network Stack with Comm-Resolution
Packets degrade with distance. The kernel knows physics.
```
Transmitting from USS Surveyor to Command Base:
Distance: 12km | Signal: ███████░░░ 72% | Latency: 45ms

Transmitting from USS Surveyor to Mars Rover:
Distance: 225M km | Signal: █░░░░░░░░ 8% | Latency: 12.5min
```

## 3. DRIVERS (C): The Hardware as Rooms

Each driver exposes a MUD room interface. The camera isn't a device - it's a **room you can visit**.

```
┌─────────────────────────────────────────────────────────────┐
│  DRIVER ARCHITECTURE                                        │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 MUD ROOM: /dev/camera/0             │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ You are in the Forward Observation Deck.    │   │   │
│  │  │                                             │   │   │
│  │  │ Exits: [bridge] [sensor_deck] [storage]     │   │   │
│  │  │                                             │   │   │
│  │  │ Items:                                      │   │   │
│  │  │   • Sony IMX477 Camera Module               │   │   │
│  │  │   • 12MP resolution                         │   │   │
│  │  │   • 60FPS capability                        │   │   │
│  │  │                                             │   │   │
│  │  │ > look                                      │   │   │
│  │  │ You see a live feed of the jungle canopy.   │   │   │
│  │  │ A monkey swings through frame.              │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                            │
│  Drivers written in C for performance, but wrapped in      │
│  capability interfaces. No direct hardware access.         │
└─────────────────────────────────────────────────────────────┘
```

**Driver Categories:**
- **Perception**: Cameras, LiDAR, Radar, Sonar
- **Locomotion**: Motor controllers, thruster drivers, servo PWM
- **Sensing**: GPS, IMU, temperature, pressure, humidity
- **Communication**: WiFi, LoRa, Satellite, Acoustic modems
- **Power**: Battery management, solar controller drivers

## 4. SERVICES (Go): The Ship's Officers

```
┌─────────────────────────────────────────────────────────────┐
│  CORE SERVICES (Go)                                         │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   MISSION   │  │   MEMORY    │  │  SQUADRON   │        │
│  │   MANAGER   │  │   WEAVER    │  │   ROUTER    │        │
│  │             │  │             │  │             │        │
│  │• Background │  │• Continual  │  │• Capability │        │
│  │  tasks      │  │  learning   │  │  dispatch   │        │
│  │• Cron jobs  │  │• Experience │  │• Load bal-  │        │
│  │  for agents │  │  replay     │  │  ancing     │        │
│  │• DAG exec   │  │• Pattern    │  │• Fleet-wide │        │
│  │             │  │  detection  │  │  scheduling │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐                         │
│  │ TOLERANCE   │  │   BATTERY   │                         │
│  │   TRACKER   │  │   MANAGER   │                         │
│  │             │  │             │                         │
│  │• Calibration│  │• Power-     │                         │
│  │  loops      │  │  aware      │                         │
│  │• Sensor     │  │  scheduling │                         │
│  │  drift comp │  │• Energy     │                         │
│  │• Health     │  │  budgeting  │                         │
│  │  monitoring │  │• Sleep      │                         │
│  │             │  │  states     │                         │
│  └─────────────┘  └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

**Memory Weaver**: Continuously trains on agent experiences, creating a shared "ship's memory" that improves all agents.

**Squadron Router**: When you have 100 drones surveying a forest, the Router decides which drone should check which area based on capabilities (thermal camera vs. multispectral).

## 5. SANDBOXING (WASM): The Agent Containment Field

```
┌─────────────────────────────────────────────────────────────┐
│  WASM SANDBOX ARCHITECTURE                                 │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 AGENT: forest_surveyor.wasm         │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ Capability Boundary                         │   │   │