package moonlauncher.agent;

import java.lang.instrument.Instrumentation;

public final class MoonOptimizerAgent {
    private static volatile boolean installed;

    private MoonOptimizerAgent() {
    }

    public static void premain(String agentArgs, Instrumentation instrumentation) {
        if (installed) {
            return;
        }

        AgentConfig config = AgentConfig.from(agentArgs);
        UniversalMinecraftTransformer transformer = new UniversalMinecraftTransformer(config);
        instrumentation.addTransformer(transformer);

        installed = true;
        System.out.println("[MoonOptimizer] Enabled javaagent with config: " + config.toCompactString());
    }
}
