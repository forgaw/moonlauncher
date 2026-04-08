# Moon Optimizer Agent

This module is an opt-in Java Agent for `moonlauncher`.

Build:

```powershell
cd java-agent
mvn -DskipTests package
```

Result jar:

`java-agent/target/moon-optimizer-agent-1.0.0.jar`

Agent args format:

`fastMath=true;entityTick=true;allocationCache=true;network=true;verbose=false`

Important:
- The agent is not hidden and should be enabled explicitly via launcher settings.
- The transformer is heuristic-based for cross-version compatibility.
- Validate on each target profile (Vanilla/Forge/Fabric/NeoForge/Snapshots) before default rollout.
