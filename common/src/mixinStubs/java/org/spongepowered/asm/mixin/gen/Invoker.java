package org.spongepowered.asm.mixin.gen;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Compile-only stand-in; see {@link org.spongepowered.asm.mixin.Mixin}. */
@Retention(RetentionPolicy.CLASS)
@Target(ElementType.METHOD)
public @interface Invoker {
    String value() default "";
}
