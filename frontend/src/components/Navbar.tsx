import { useAuth } from "react-oidc-context"
import { NavLink } from "react-router"

export default function Navbar() {
	const auth = useAuth()

	return (
		<div className="navbar bg-base-100 shadow-sm">
			<div className="flex-1">
				<NavLink to="/" className="btn btn-ghost text-xl">
					Fractals
				</NavLink>
			</div>
			<div className="flex-none">
				<ul className="menu menu-horizontal px-1">
					<li>
						<NavLink to="/">Generate</NavLink>
					</li>
					<li>
						<NavLink to="/gallery">Gallery</NavLink>
					</li>
				</ul>
			</div>
			<div className="flex-none">
				{auth.isAuthenticated ? (
					<div className="dropdown dropdown-end">
						<button
							tabIndex={0}
							type="button"
							className="btn btn-ghost rounded-field"
						>
							{auth.user?.profile.email}
						</button>
						<ul className="menu dropdown-content bg-base-200 rounded-box z-1 mt-4 w-52 p-2 shadow-sm">
							<li className="menu-disabled">
								<p>{auth.user?.profile.email}</p>
							</li>
							<li>
								<button type="button" onClick={() => auth.removeUser()}>
									Log out
								</button>
							</li>
						</ul>
					</div>
				) : (
					<button
						type="button"
						className="btn btn-neutral"
						onClick={() => auth.signinRedirect()}
					>
						log in
					</button>
				)}
			</div>
		</div>
	)
}
