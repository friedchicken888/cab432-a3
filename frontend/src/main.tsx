import { type UserManagerSettings, WebStorageStateStore } from "oidc-client-ts"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AuthProvider } from "react-oidc-context"
import { BrowserRouter, Route, Routes } from "react-router"
import "./main.css"
import Layout from "./layout.tsx"
import Gallery from "./pages/Gallery.tsx"
import Generate from "./pages/Generate.tsx"

const cognitoAuthConfig: UserManagerSettings = {
	authority: import.meta.env.VITE_COGNITO_AUTHORITY,
	client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
	client_secret: import.meta.env.VITE_COGNITO_CLIENT_SECRET,
	redirect_uri: import.meta.env.VITE_COGNITO_REDIRECT_URI,
	response_type: "code",
	scope: "email openid phone",
	userStore: new WebStorageStateStore({
		store: localStorage,
	}),
}

export const API_URL = import.meta.env.VITE_API_URL

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<AuthProvider {...cognitoAuthConfig}>
			<BrowserRouter>
				<Routes>
					<Route element={<Layout />}>
						<Route index element={<Generate />} />
						<Route path="/gallery" element={<Gallery />} />
						<Route path="*" />
					</Route>
				</Routes>
			</BrowserRouter>
		</AuthProvider>
	</StrictMode>,
)
