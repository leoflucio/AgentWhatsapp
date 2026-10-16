import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, inputMode, step, ...props }, ref) => {
    const numeric = type === "number";
    return (
      <input
        type={type}
        step={step}
        // Campo numérico: teclado de números no celular e conteúdo selecionado ao tocar,
        // para o dígito novo substituir o antigo em vez de ir ao lado (ex.: "0" + "15").
        inputMode={
          inputMode ??
          (numeric ? (String(step ?? "").includes(".") ? "decimal" : "numeric") : undefined)
        }
        onFocus={(e) => {
          if (numeric && !props.readOnly) e.target.select();
          onFocus?.(e);
        }}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
