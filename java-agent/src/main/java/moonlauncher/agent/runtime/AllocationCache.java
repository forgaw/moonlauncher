package moonlauncher.agent.runtime;

import java.lang.reflect.Constructor;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class AllocationCache {
    private static final int MAX_THREAD_CACHE_SIZE = 1024;
    private static final Map<String, Constructor<?>> CTOR_CACHE = new ConcurrentHashMap<String, Constructor<?>>();

    private static final ThreadLocal<Map<String, Object>> BLOCK_POS_CACHE = new ThreadLocal<Map<String, Object>>() {
        @Override
        protected Map<String, Object> initialValue() {
            return new LruMap<String, Object>(MAX_THREAD_CACHE_SIZE);
        }
    };

    private static final ThreadLocal<Map<String, Object>> VEC_CACHE = new ThreadLocal<Map<String, Object>>() {
        @Override
        protected Map<String, Object> initialValue() {
            return new LruMap<String, Object>(MAX_THREAD_CACHE_SIZE);
        }
    };

    private AllocationCache() {
    }

    public static Object createBlockPos(int x, int y, int z, String ownerInternalName) {
        String key = ownerInternalName + "|" + x + "|" + y + "|" + z;
        Map<String, Object> cache = BLOCK_POS_CACHE.get();
        Object cached = cache.get(key);
        if (cached != null) {
            return cached;
        }

        Object created = newInstance(ownerInternalName, new Class<?>[]{int.class, int.class, int.class}, new Object[]{x, y, z});
        cache.put(key, created);
        return created;
    }

    public static Object createVec3(double x, double y, double z, String ownerInternalName) {
        String key = ownerInternalName + "|" + Double.doubleToLongBits(x) + "|" + Double.doubleToLongBits(y) + "|" + Double.doubleToLongBits(z);
        Map<String, Object> cache = VEC_CACHE.get();
        Object cached = cache.get(key);
        if (cached != null) {
            return cached;
        }

        Object created = newInstance(ownerInternalName, new Class<?>[]{double.class, double.class, double.class}, new Object[]{x, y, z});
        cache.put(key, created);
        return created;
    }

    private static Object newInstance(String ownerInternalName, Class<?>[] signature, Object[] values) {
        String className = ownerInternalName.replace('/', '.');
        String ctorKey = className + "#" + signatureKey(signature);

        try {
            Constructor<?> ctor = CTOR_CACHE.get(ctorKey);
            if (ctor == null) {
                Class<?> type = Class.forName(className, false, Thread.currentThread().getContextClassLoader());
                ctor = type.getDeclaredConstructor(signature);
                ctor.setAccessible(true);
                CTOR_CACHE.put(ctorKey, ctor);
            }
            return ctor.newInstance(values);
        } catch (Throwable throwable) {
            throw new RuntimeException("AllocationCache failed for " + className, throwable);
        }
    }

    private static String signatureKey(Class<?>[] signature) {
        StringBuilder builder = new StringBuilder();
        for (Class<?> type : signature) {
            if (builder.length() > 0) {
                builder.append(',');
            }
            builder.append(type.getName());
        }
        return builder.toString();
    }

    private static final class LruMap<K, V> extends LinkedHashMap<K, V> {
        private final int maxSize;

        private LruMap(int maxSize) {
            super(128, 0.75f, true);
            this.maxSize = maxSize;
        }

        @Override
        protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
            return size() > maxSize;
        }
    }
}
