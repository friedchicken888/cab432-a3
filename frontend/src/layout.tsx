import { useAuth } from "react-oidc-context"
import { Outlet } from "react-router"
import Navbar from "./components/Navbar"

export default function Layout() {
	const auth = useAuth()
	return (
		<>
			<Navbar />
			<main>
				<div className="flex flex-col mx-auto p-4 pt-0 md:max-w-xl lg:max-w-7xl my-4 items-center">
					{auth.isLoading ? (
						<div className="flex items-center justify-center pt-24">
							Loading...
						</div>
					) : auth.error ? (
						<div className="flex flex-col items-center justify-center pt-24">
							<h2 className="text-xl font-semibold text-error mb-2">
								Authentication Error
							</h2>
							<p>{auth.error.message}</p>
						</div>
					) : !auth.isAuthenticated ? (
						<div className="flex flex-col items-center justify-center pt-24">
							<h2 className="text-xl font-semibold">Please log in</h2>
							<p className="opacity-75">
								You need to sign in to access this page.
							</p>
						</div>
					) : (
						// ✅ Render protected routes when authenticated
						<Outlet />
					)}
				</div>
			</main>
		</>
	)
}
