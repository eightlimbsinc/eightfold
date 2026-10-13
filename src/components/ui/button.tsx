import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-navy-900 text-white hover:bg-navy-700 active:bg-navy-800",
        accent: "bg-gold-500 text-navy-950 hover:bg-gold-400 active:bg-gold-600",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-canvas active:bg-navy-50",
        ghost: "text-ink-muted hover:bg-navy-50 hover:text-ink",
        danger: "bg-red-700 text-white hover:bg-red-600",
        "danger-outline": "border border-red-200 bg-surface text-red-700 hover:bg-red-50",
        link: "h-auto px-0 text-navy-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-[13px]",
        md: "h-8.5 px-3.5 text-[13.5px]",
        lg: "h-10 px-5 text-sm",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
