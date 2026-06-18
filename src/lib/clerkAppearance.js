/** Shared Clerk UI theme for Login / Register (dark LBV brand). */
export const clerkAppearance = {
  variables: {
    colorBackground: "#18181b",
    colorInputBackground: "#09090b",
    colorInputText: "#fafafa",
    colorText: "#fafafa",
    colorTextSecondary: "#d4d4d8",
    colorTextOnPrimaryBackground: "#ffffff",
    colorPrimary: "#f43f5e",
    colorDanger: "#fb7185",
    colorSuccess: "#34d399",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full",
    card: "bg-zinc-900 border border-zinc-700 text-zinc-50 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.7)] rounded-[32px] backdrop-blur-md",
    headerTitle: "text-zinc-50 font-serif text-2xl tracking-tight",
    headerSubtitle: "text-zinc-300 font-light text-sm",
    main: "text-zinc-200",
    socialButtonsBlockButton:
      "bg-zinc-800 border-zinc-600 text-zinc-50 hover:bg-zinc-700 transition-colors rounded-xl",
    socialButtonsBlockButtonText: "text-zinc-100 font-medium",
    dividerLine: "bg-zinc-700",
    dividerText: "text-zinc-400 text-xs uppercase tracking-wider",
    formFieldLabel: "text-zinc-200 text-xs font-semibold uppercase tracking-wider",
    formFieldInput:
      "bg-zinc-950 border-2 border-zinc-600 text-zinc-50 placeholder:text-zinc-500 rounded-xl focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 transition-all",
    formFieldInfoText: "text-zinc-300 text-sm",
    formButtonPrimary:
      "bg-gradient-to-r from-rose-500 to-amber-500 hover:opacity-95 text-white font-semibold h-11 border-0 shadow-md rounded-full transition-all",
    footerActionText: "text-zinc-300 text-sm",
    footerActionLink: "text-amber-400 hover:text-amber-300 font-medium transition-colors",
    identityPreviewText: "text-zinc-200",
    identityPreviewEditButton: "text-amber-400 hover:text-amber-300",
    formFieldSuccessText: "text-emerald-400",
    formFieldErrorText: "text-rose-400",
    alertText: "text-zinc-200",
    formResendCodeLink: "text-amber-400 hover:text-amber-300 font-medium",
    // Email verification code boxes
    otpCodeFieldInputs: "gap-3 justify-center",
    otpCodeFieldInput:
      "!bg-zinc-950 !border-2 !border-zinc-500 !text-white !text-2xl !font-semibold !shadow-inner !caret-amber-400 focus:!border-amber-400 focus:!ring-2 focus:!ring-amber-400/40 !rounded-xl !min-h-[3rem]",
    formFieldInputShowPasswordButton: "text-zinc-300 hover:text-zinc-100",
    alternativeMethodsBlockButton: "text-zinc-200 hover:text-white",
  },
};
