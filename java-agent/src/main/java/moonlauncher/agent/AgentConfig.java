package moonlauncher.agent;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

final class AgentConfig {
    final boolean fastMath;
    final boolean entityTick;
    final boolean allocationCache;
    final boolean network;
    final boolean verbose;

    private AgentConfig(
        boolean fastMath,
        boolean entityTick,
        boolean allocationCache,
        boolean network,
        boolean verbose
    ) {
        this.fastMath = fastMath;
        this.entityTick = entityTick;
        this.allocationCache = allocationCache;
        this.network = network;
        this.verbose = verbose;
    }

    static AgentConfig from(String rawArgs) {
        Map<String, String> values = parse(rawArgs);
        return new AgentConfig(
            getBoolean(values, "fastMath", true),
            getBoolean(values, "entityTick", true),
            getBoolean(values, "allocationCache", true),
            getBoolean(values, "network", true),
            getBoolean(values, "verbose", false)
        );
    }

    String toCompactString() {
        return "fastMath=" + fastMath
            + ";entityTick=" + entityTick
            + ";allocationCache=" + allocationCache
            + ";network=" + network
            + ";verbose=" + verbose;
    }

    private static Map<String, String> parse(String rawArgs) {
        Map<String, String> map = new HashMap<String, String>();
        if (rawArgs == null || rawArgs.trim().isEmpty()) {
            return map;
        }

        String[] chunks = rawArgs.split("[;,]");
        for (String chunk : chunks) {
            String part = chunk.trim();
            if (part.isEmpty()) {
                continue;
            }

            int separator = part.indexOf('=');
            if (separator < 0) {
                map.put(part.toLowerCase(Locale.ROOT), "true");
                continue;
            }

            String key = part.substring(0, separator).trim().toLowerCase(Locale.ROOT);
            String value = part.substring(separator + 1).trim();
            if (!key.isEmpty()) {
                map.put(key, value);
            }
        }
        return map;
    }

    private static boolean getBoolean(Map<String, String> values, String key, boolean defaultValue) {
        String raw = values.get(key.toLowerCase(Locale.ROOT));
        if (raw == null || raw.isEmpty()) {
            return defaultValue;
        }

        String lowered = raw.toLowerCase(Locale.ROOT);
        if ("1".equals(lowered) || "true".equals(lowered) || "yes".equals(lowered) || "on".equals(lowered)) {
            return true;
        }
        if ("0".equals(lowered) || "false".equals(lowered) || "no".equals(lowered) || "off".equals(lowered)) {
            return false;
        }
        return defaultValue;
    }
}
