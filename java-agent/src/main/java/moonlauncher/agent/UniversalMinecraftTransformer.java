package moonlauncher.agent;

import moonlauncher.agent.runtime.AllocationCache;
import moonlauncher.agent.runtime.FastTrig;
import moonlauncher.agent.runtime.NetworkTuner;
import moonlauncher.agent.runtime.TickRateController;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FrameNode;
import org.objectweb.asm.tree.InsnList;
import org.objectweb.asm.tree.InsnNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.LabelNode;
import org.objectweb.asm.tree.LineNumberNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;
import org.objectweb.asm.tree.VarInsnNode;

import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.IllegalClassFormatException;
import java.security.ProtectionDomain;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

final class UniversalMinecraftTransformer implements ClassFileTransformer, Opcodes {
    private static final String RUNTIME_FAST_TRIG = Type.getInternalName(FastTrig.class);
    private static final String RUNTIME_TICK_CONTROLLER = Type.getInternalName(TickRateController.class);
    private static final String RUNTIME_ALLOC_CACHE = Type.getInternalName(AllocationCache.class);
    private static final String RUNTIME_NETWORK = Type.getInternalName(NetworkTuner.class);

    private static final Set<String> TICK_METHOD_NAMES = new HashSet<String>(Arrays.asList(
        "tick",
        "baseTick",
        "aiStep",
        "method_5773",
        "m_8119_",
        "m_6083_"
    ));

    private static final Set<String> SEND_METHOD_NAMES = new HashSet<String>(Arrays.asList(
        "send",
        "sendPacket",
        "writePacket",
        "method_10743",
        "m_129514_"
    ));

    private final AgentConfig config;

    UniversalMinecraftTransformer(AgentConfig config) {
        this.config = config;
    }

    @Override
    public byte[] transform(
        ClassLoader loader,
        String className,
        Class<?> classBeingRedefined,
        ProtectionDomain protectionDomain,
        byte[] classfileBuffer
    ) throws IllegalClassFormatException {
        if (className == null || classfileBuffer == null) {
            return null;
        }

        if (className.startsWith("moonlauncher/agent/") || !isTransformTarget(className)) {
            return null;
        }

        try {
            ClassReader reader = new ClassReader(classfileBuffer);
            ClassNode classNode = new ClassNode();
            reader.accept(classNode, 0);

            boolean changed = false;
            if (config.fastMath) {
                changed |= patchFastMath(classNode);
            }
            if (config.entityTick) {
                changed |= patchEntityTicking(classNode);
            }
            if (config.allocationCache) {
                changed |= patchAllocations(classNode);
            }
            if (config.network) {
                changed |= patchNetwork(classNode);
            }

            if (!changed) {
                return null;
            }

            ClassWriter writer = new SafeClassWriter(ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
            classNode.accept(writer);
            return writer.toByteArray();
        } catch (Throwable throwable) {
            if (config.verbose) {
                System.err.println("[MoonOptimizer] Transform failed for " + className + ": " + throwable.getMessage());
            }
            return null;
        }
    }

    private static boolean isTransformTarget(String className) {
        return className.startsWith("net/minecraft/")
            || className.startsWith("com/mojang/")
            || className.startsWith("io/netty/")
            || className.startsWith("net/minecraftforge/")
            || className.startsWith("cpw/mods/");
    }

    private boolean patchFastMath(ClassNode classNode) {
        boolean changed = false;
        for (MethodNode method : classNode.methods) {
            if (!"(F)F".equals(method.desc) || isAbstractOrNative(method.access)) {
                continue;
            }

            TrigKind kind = detectTrigKind(method);
            if (kind == TrigKind.NONE) {
                continue;
            }

            method.instructions.clear();
            method.tryCatchBlocks.clear();

            InsnList body = new InsnList();
            int argIndex = isStatic(method.access) ? 0 : 1;
            body.add(new VarInsnNode(FLOAD, argIndex));
            body.add(new MethodInsnNode(
                INVOKESTATIC,
                RUNTIME_FAST_TRIG,
                kind == TrigKind.SIN ? "sin" : "cos",
                "(F)F",
                false
            ));
            body.add(new InsnNode(FRETURN));
            method.instructions.add(body);
            changed = true;
        }
        return changed;
    }

    private boolean patchEntityTicking(ClassNode classNode) {
        if (!isLikelyEntityClass(classNode)) {
            return false;
        }

        boolean changed = false;
        for (MethodNode method : classNode.methods) {
            if (isAbstractOrNative(method.access) || isStatic(method.access)) {
                continue;
            }
            if (!"()V".equals(method.desc) || method.name.startsWith("<")) {
                continue;
            }
            if (!TICK_METHOD_NAMES.contains(method.name)) {
                continue;
            }

            InsnList hook = new InsnList();
            LabelNode continueLabel = new LabelNode();
            hook.add(new VarInsnNode(ALOAD, 0));
            hook.add(new MethodInsnNode(
                INVOKESTATIC,
                RUNTIME_TICK_CONTROLLER,
                "shouldSkipTick",
                "(Ljava/lang/Object;)Z",
                false
            ));
            hook.add(new JumpInsnNode(IFEQ, continueLabel));
            hook.add(new InsnNode(RETURN));
            hook.add(continueLabel);

            insertAtMethodStart(method, hook);
            changed = true;
        }
        return changed;
    }

    private boolean patchAllocations(ClassNode classNode) {
        boolean changed = false;
        for (MethodNode method : classNode.methods) {
            if (isAbstractOrNative(method.access)) {
                continue;
            }

            for (AbstractInsnNode current = method.instructions.getFirst(); current != null; ) {
                AbstractInsnNode next = current.getNext();
                if (!(current instanceof MethodInsnNode)) {
                    current = next;
                    continue;
                }

                MethodInsnNode ctor = (MethodInsnNode) current;
                if (ctor.getOpcode() != INVOKESPECIAL || !"<init>".equals(ctor.name)) {
                    current = next;
                    continue;
                }

                boolean blockPosCtor = isBlockPosCtor(ctor.owner, ctor.desc);
                boolean vecCtor = isVecCtor(ctor.owner, ctor.desc);
                if (!blockPosCtor && !vecCtor) {
                    current = next;
                    continue;
                }

                AbstractInsnNode dup = previousReal(current.getPrevious());
                AbstractInsnNode newInsn = dup != null ? previousReal(dup.getPrevious()) : null;
                if (dup == null || dup.getOpcode() != DUP) {
                    current = next;
                    continue;
                }
                if (!(newInsn instanceof TypeInsnNode) || newInsn.getOpcode() != NEW) {
                    current = next;
                    continue;
                }
                if (!ctor.owner.equals(((TypeInsnNode) newInsn).desc)) {
                    current = next;
                    continue;
                }

                method.instructions.remove(newInsn);
                method.instructions.remove(dup);

                InsnList replacement = new InsnList();
                replacement.add(new LdcInsnNode(ctor.owner));
                if (blockPosCtor) {
                    replacement.add(new MethodInsnNode(
                        INVOKESTATIC,
                        RUNTIME_ALLOC_CACHE,
                        "createBlockPos",
                        "(IIILjava/lang/String;)Ljava/lang/Object;",
                        false
                    ));
                } else {
                    replacement.add(new MethodInsnNode(
                        INVOKESTATIC,
                        RUNTIME_ALLOC_CACHE,
                        "createVec3",
                        "(DDDLjava/lang/String;)Ljava/lang/Object;",
                        false
                    ));
                }
                replacement.add(new TypeInsnNode(CHECKCAST, ctor.owner));

                method.instructions.insert(current, replacement);
                method.instructions.remove(current);
                changed = true;
                current = next;
            }
        }
        return changed;
    }

    private boolean patchNetwork(ClassNode classNode) {
        boolean changed = false;
        String lowerName = classNode.name.toLowerCase(Locale.ROOT);
        boolean likelyNetworkClass = lowerName.contains("/network/") || lowerName.contains("netty") || classNode.name.endsWith("class_2535");

        for (MethodNode method : classNode.methods) {
            if (isAbstractOrNative(method.access)) {
                continue;
            }

            int channelArgIndex = findArgumentIndex(method.desc, "io/netty/channel/Channel", isStatic(method.access));
            if (channelArgIndex >= 0) {
                InsnList hook = new InsnList();
                hook.add(new VarInsnNode(ALOAD, channelArgIndex));
                hook.add(new MethodInsnNode(
                    INVOKESTATIC,
                    RUNTIME_NETWORK,
                    "tuneChannel",
                    "(Ljava/lang/Object;)V",
                    false
                ));
                insertAtMethodStart(method, hook);
                changed = true;
            }

            if (likelyNetworkClass && SEND_METHOD_NAMES.contains(method.name)) {
                Type[] args = Type.getArgumentTypes(method.desc);
                if (args.length > 0 && (args[0].getSort() == Type.OBJECT || args[0].getSort() == Type.ARRAY)) {
                    int firstArgIndex = isStatic(method.access) ? 0 : 1;
                    InsnList hook = new InsnList();
                    hook.add(new VarInsnNode(ALOAD, firstArgIndex));
                    hook.add(new MethodInsnNode(
                        INVOKESTATIC,
                        RUNTIME_NETWORK,
                        "onPacketSend",
                        "(Ljava/lang/Object;)V",
                        false
                    ));
                    insertAtMethodStart(method, hook);
                    changed = true;
                }
            }
        }
        return changed;
    }

    private static TrigKind detectTrigKind(MethodNode method) {
        for (AbstractInsnNode node = method.instructions.getFirst(); node != null; node = node.getNext()) {
            if (!(node instanceof MethodInsnNode)) {
                continue;
            }
            MethodInsnNode call = (MethodInsnNode) node;
            if (call.getOpcode() != INVOKESTATIC) {
                continue;
            }
            if (!("java/lang/Math".equals(call.owner) || "java/lang/StrictMath".equals(call.owner))) {
                continue;
            }
            if ("sin".equals(call.name) && "(D)D".equals(call.desc)) {
                return TrigKind.SIN;
            }
            if ("cos".equals(call.name) && "(D)D".equals(call.desc)) {
                return TrigKind.COS;
            }
        }
        return TrigKind.NONE;
    }

    private static boolean isLikelyEntityClass(ClassNode classNode) {
        String name = classNode.name == null ? "" : classNode.name.toLowerCase(Locale.ROOT);
        String superName = classNode.superName == null ? "" : classNode.superName.toLowerCase(Locale.ROOT);
        return name.contains("/entity/")
            || superName.contains("entity")
            || classNode.name.endsWith("class_1297")
            || (classNode.superName != null && classNode.superName.endsWith("class_1297"));
    }

    private static boolean isBlockPosCtor(String owner, String desc) {
        String lowerOwner = owner.toLowerCase(Locale.ROOT);
        return "(III)V".equals(desc)
            && (lowerOwner.contains("blockpos") || owner.endsWith("class_2338"));
    }

    private static boolean isVecCtor(String owner, String desc) {
        String lowerOwner = owner.toLowerCase(Locale.ROOT);
        return "(DDD)V".equals(desc)
            && (lowerOwner.contains("vec3") || lowerOwner.contains("vec3d") || owner.endsWith("class_243"));
    }

    private static int findArgumentIndex(String methodDesc, String internalName, boolean isStaticMethod) {
        int index = isStaticMethod ? 0 : 1;
        for (Type type : Type.getArgumentTypes(methodDesc)) {
            if (type.getSort() == Type.OBJECT && internalName.equals(type.getInternalName())) {
                return index;
            }
            index += type.getSize();
        }
        return -1;
    }

    private static void insertAtMethodStart(MethodNode method, InsnList hook) {
        AbstractInsnNode first = method.instructions.getFirst();
        if (first == null) {
            method.instructions.add(hook);
        } else {
            method.instructions.insertBefore(first, hook);
        }
    }

    private static AbstractInsnNode previousReal(AbstractInsnNode node) {
        AbstractInsnNode current = node;
        while (current != null && (current instanceof LabelNode || current instanceof LineNumberNode || current instanceof FrameNode)) {
            current = current.getPrevious();
        }
        return current;
    }

    private static boolean isAbstractOrNative(int access) {
        return (access & (ACC_ABSTRACT | ACC_NATIVE)) != 0;
    }

    private static boolean isStatic(int access) {
        return (access & ACC_STATIC) != 0;
    }

    private enum TrigKind {
        NONE,
        SIN,
        COS
    }

    private static final class SafeClassWriter extends ClassWriter {
        SafeClassWriter(int flags) {
            super(flags);
        }

        @Override
        protected String getCommonSuperClass(String type1, String type2) {
            return "java/lang/Object";
        }
    }
}
