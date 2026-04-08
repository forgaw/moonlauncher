package moonlauncher.agent.runtime;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

final class ReflectionAccess {
    private static final List<String> WORLD_METHODS = Arrays.asList("level", "getWorld", "world", "method_37908", "m_9236_");
    private static final List<String> WORLD_FIELDS = Arrays.asList("level", "world", "field_6002", "f_19853_");

    private static final List<String> PLAYER_LIST_METHODS = Arrays.asList("players", "getPlayers", "method_18456", "m_6907_");
    private static final List<String> PLAYER_LIST_FIELDS = Arrays.asList("players", "field_217491_a", "f_11196_");

    private static final List<String> X_METHODS = Arrays.asList("getX", "method_23317", "m_20185_");
    private static final List<String> Y_METHODS = Arrays.asList("getY", "method_23318", "m_20186_");
    private static final List<String> Z_METHODS = Arrays.asList("getZ", "method_23321", "m_20189_");

    private static final List<String> X_FIELDS = Arrays.asList("x", "field_6036", "f_19854_");
    private static final List<String> Y_FIELDS = Arrays.asList("y", "field_6037", "f_19855_");
    private static final List<String> Z_FIELDS = Arrays.asList("z", "field_6038", "f_19856_");

    private ReflectionAccess() {
    }

    static Object readWorld(Object entity) {
        Object world = invokeNoArg(entity, WORLD_METHODS);
        if (world != null) {
            return world;
        }
        return readField(entity, WORLD_FIELDS);
    }

    static Iterable<?> readPlayers(Object world) {
        Object fromMethod = invokeNoArg(world, PLAYER_LIST_METHODS);
        if (fromMethod instanceof Iterable<?>) {
            return (Iterable<?>) fromMethod;
        }

        Object fromField = readField(world, PLAYER_LIST_FIELDS);
        if (fromField instanceof Iterable<?>) {
            return (Iterable<?>) fromField;
        }

        return Collections.emptyList();
    }

    static double[] readXYZ(Object target) {
        Double x = readCoordinate(target, X_METHODS, X_FIELDS);
        Double y = readCoordinate(target, Y_METHODS, Y_FIELDS);
        Double z = readCoordinate(target, Z_METHODS, Z_FIELDS);
        if (x == null || y == null || z == null) {
            return null;
        }
        return new double[]{x.doubleValue(), y.doubleValue(), z.doubleValue()};
    }

    private static Double readCoordinate(Object target, List<String> methodNames, List<String> fieldNames) {
        Object fromMethod = invokeNoArg(target, methodNames);
        if (fromMethod instanceof Number) {
            return ((Number) fromMethod).doubleValue();
        }

        Object fromField = readField(target, fieldNames);
        if (fromField instanceof Number) {
            return ((Number) fromField).doubleValue();
        }

        return null;
    }

    private static Object invokeNoArg(Object target, List<String> methodNames) {
        if (target == null) {
            return null;
        }

        Class<?> type = target.getClass();
        for (String name : methodNames) {
            try {
                Method method = type.getMethod(name);
                method.setAccessible(true);
                return method.invoke(target);
            } catch (Throwable ignored) {
                // continue fallback chain
            }
        }
        return null;
    }

    private static Object readField(Object target, List<String> fieldNames) {
        if (target == null) {
            return null;
        }

        Class<?> current = target.getClass();
        while (current != null && current != Object.class) {
            for (String name : fieldNames) {
                try {
                    Field field = current.getDeclaredField(name);
                    field.setAccessible(true);
                    return field.get(target);
                } catch (Throwable ignored) {
                    // continue fallback chain
                }
            }
            current = current.getSuperclass();
        }
        return null;
    }
}
