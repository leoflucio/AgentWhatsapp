import * as React from "react";

import { Input } from "@/components/ui/input";

type Props = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "min" | "max" | "defaultValue"
> & {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  max?: number;
  /** Valor usado se o campo ficar vazio ao sair dele (padrão: o mínimo, ou o valor atual). */
  fallback?: number;
};

/**
 * Campo numérico que deixa APAGAR tudo para digitar do zero (no celular, um campo ligado
 * direto a um número volta para 0/1 na hora e o dígito novo vai ao lado do antigo).
 * Enquanto a pessoa digita, só repassa valores válidos (dentro de min/max); ao sair do
 * campo, corrige para o intervalo ou volta ao valor padrão. Seleciona o conteúdo ao tocar.
 */
export const NumericInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onValueChange, min, max, fallback, step, onBlur, onFocus, ...props }, ref) => {
    const decimal = step !== undefined && String(step).includes(".");
    const [draft, setDraft] = React.useState(String(value));
    const focused = React.useRef(false);

    // Mudança vinda de fora (ex.: carregou o registro): só reflete se não está digitando.
    React.useEffect(() => {
      if (!focused.current) setDraft(String(value));
    }, [value]);

    const parse = (s: string): number | null => {
      const n = Number(s.replace(",", "."));
      return s.trim() !== "" && Number.isFinite(n) ? n : null;
    };
    const inRange = (n: number) =>
      (min === undefined || n >= min) && (max === undefined || n <= max);
    const clamp = (n: number) =>
      Math.min(max ?? Infinity, Math.max(min ?? -Infinity, decimal ? n : Math.round(n)));

    return (
      <Input
        {...props}
        ref={ref}
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode={decimal ? "decimal" : "numeric"}
        value={draft}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parse(e.target.value);
          if (n !== null && inRange(n)) onValueChange(n);
        }}
        onBlur={(e) => {
          focused.current = false;
          const n = parse(e.target.value);
          const final = n === null ? (fallback ?? min ?? value) : clamp(n);
          setDraft(String(final));
          if (final !== value) onValueChange(final);
          onBlur?.(e);
        }}
      />
    );
  },
);
NumericInput.displayName = "NumericInput";
