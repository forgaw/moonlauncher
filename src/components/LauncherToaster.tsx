import { Toaster } from "sonner"

export function LauncherToaster() {
  return (
    <Toaster
      position="bottom-center"
      expand={false}
      closeButton
      visibleToasts={5}
      richColors
      toastOptions={{
        className: "moon-toast",
        descriptionClassName: "moon-toast-description",
      }}
    />
  )
}
