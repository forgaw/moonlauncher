package moonlauncher.agent.runtime;

public final class FastTrig {
    private static final int TABLE_SIZE = 1 << 16;
    private static final int TABLE_MASK = TABLE_SIZE - 1;
    private static final float PI2 = (float) (Math.PI * 2.0D);
    private static final float RAD_TO_INDEX = TABLE_SIZE / PI2;

    private static final float[] SIN_TABLE = new float[TABLE_SIZE];

    static {
        for (int i = 0; i < TABLE_SIZE; i++) {
            SIN_TABLE[i] = (float) Math.sin((i * PI2) / TABLE_SIZE);
        }
    }

    private FastTrig() {
    }

    public static float sin(float radians) {
        int index = (int) (radians * RAD_TO_INDEX);
        return SIN_TABLE[index & TABLE_MASK];
    }

    public static float cos(float radians) {
        int index = (int) (radians * RAD_TO_INDEX) + (TABLE_SIZE >> 2);
        return SIN_TABLE[index & TABLE_MASK];
    }
}
