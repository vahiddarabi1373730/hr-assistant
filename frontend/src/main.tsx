import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"

import App from "./App.tsx"
import { AuthProvider } from "@/auth"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DirectionProvider } from "@base-ui/react/direction-provider"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <DirectionProvider direction="rtl"><TooltipProvider><App /></TooltipProvider></DirectionProvider>
    </AuthProvider>
  </BrowserRouter>,
)
