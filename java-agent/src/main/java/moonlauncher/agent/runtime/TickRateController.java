package moonlauncher.agent.runtime;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public final class TickRateController {
    private static final int CHUNK_SIZE = 16;
    private static final int MAX_DISTANCE_CHUNKS = 4;
    private static final double FAR_DISTANCE_SQ = (double) (CHUNK_SIZE * MAX_DISTANCE_CHUNKS) * (CHUNK_SIZE * MAX_DISTANCE_CHUNKS);

    private static final Map<Object, AtomicInteger> ENTITY_COUNTERS = Collections.synchronizedMap(new WeakHashMap<Object, AtomicInteger>());

    private TickRateController() {
    }

    public static boolean shouldSkipTick(Object entity) {
        if (entity == null) {
            return false;
        }
        if (!isFarFromPlayers(entity)) {
            return false;
        }

        AtomicInteger counter = ENTITY_COUNTERS.get(entity);
        if (counter == null) {
            counter = new AtomicInteger();
            ENTITY_COUNTERS.put(entity, counter);
        }

        int value = counter.incrementAndGet();
        return (value & 1) == 0;
    }

    private static boolean isFarFromPlayers(Object entity) {
        Object world = ReflectionAccess.readWorld(entity);
        if (world == null) {
            return false;
        }

        Iterable<?> players = ReflectionAccess.readPlayers(world);
        if (players == null) {
            return false;
        }

        double[] entityPos = ReflectionAccess.readXYZ(entity);
        if (entityPos == null) {
            return false;
        }

        double nearestSq = Double.MAX_VALUE;
        for (Object player : players) {
            if (player == null) {
                continue;
            }
            double[] playerPos = ReflectionAccess.readXYZ(player);
            if (playerPos == null) {
                continue;
            }

            double dx = entityPos[0] - playerPos[0];
            double dy = entityPos[1] - playerPos[1];
            double dz = entityPos[2] - playerPos[2];
            double distSq = (dx * dx) + (dy * dy) + (dz * dz);
            if (distSq < nearestSq) {
                nearestSq = distSq;
            }
            if (nearestSq <= FAR_DISTANCE_SQ) {
                return false;
            }
        }

        return nearestSq < Double.MAX_VALUE;
    }
}
