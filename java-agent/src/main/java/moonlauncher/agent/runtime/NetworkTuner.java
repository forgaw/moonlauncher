package moonlauncher.agent.runtime;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.Locale;

public final class NetworkTuner {
    private NetworkTuner() {
    }

    public static void tuneChannel(Object channel) {
        if (channel == null) {
            return;
        }

        try {
            Method configMethod = channel.getClass().getMethod("config");
            Object config = configMethod.invoke(channel);
            if (config == null) {
                return;
            }

            invokeSetOption(config, "TCP_NODELAY", Boolean.TRUE);
            invokeSetOption(config, "SO_KEEPALIVE", Boolean.TRUE);
            invokeSetAutoRead(config, true);
            invokeWriteBufferWaterMark(config, 32768, 131072);
        } catch (Throwable ignored) {
            // keep game stable on unsupported implementations
        }
    }

    public static void onPacketSend(Object packet) {
        if (packet == null) {
            return;
        }

        String simpleName = packet.getClass().getSimpleName().toLowerCase(Locale.ROOT);
        if (simpleName.contains("move") || simpleName.contains("position") || simpleName.contains("look")) {
            Thread thread = Thread.currentThread();
            int priority = thread.getPriority();
            if (priority < Thread.NORM_PRIORITY + 1) {
                thread.setPriority(Thread.NORM_PRIORITY + 1);
            }
        }
    }

    private static void invokeSetOption(Object config, String optionFieldName, Object value) {
        try {
            Class<?> channelOption = Class.forName("io.netty.channel.ChannelOption", false, config.getClass().getClassLoader());
            Object option = channelOption.getField(optionFieldName).get(null);
            Method setOption = config.getClass().getMethod("setOption", channelOption, Object.class);
            setOption.invoke(config, option, value);
        } catch (Throwable ignored) {
            // optional per netty version
        }
    }

    private static void invokeSetAutoRead(Object config, boolean enabled) {
        try {
            Method setAutoRead = config.getClass().getMethod("setAutoRead", boolean.class);
            setAutoRead.invoke(config, enabled);
        } catch (Throwable ignored) {
            // optional per netty version
        }
    }

    private static void invokeWriteBufferWaterMark(Object config, int low, int high) {
        try {
            ClassLoader loader = config.getClass().getClassLoader();
            Class<?> watermarkType = Class.forName("io.netty.channel.WriteBufferWaterMark", false, loader);
            Constructor<?> constructor = watermarkType.getConstructor(int.class, int.class);
            Object watermark = constructor.newInstance(low, high);
            Method setter = config.getClass().getMethod("setWriteBufferWaterMark", watermarkType);
            setter.invoke(config, watermark);
        } catch (Throwable ignored) {
            // optional per netty version
        }
    }
}
