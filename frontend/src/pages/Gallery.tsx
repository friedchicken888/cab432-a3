import { useEffect, useState } from "react"
import { useAuth } from "react-oidc-context"
import { API_URL } from "../main"

interface GalleryImage {
	id: string | number
	url: string
	title?: string
	description?: string
}

export default function Gallery() {
	const [images, setImages] = useState<GalleryImage[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const auth = useAuth()

	useEffect(() => {
		if (!auth.user?.id_token) return

		const fetchGallery = async () => {
			try {
				const response = await fetch(`${API_URL}/api/gallery`, {
					headers: {
						Authorization: `Bearer ${auth.user?.id_token}`,
					},
				})

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`)
				}

				const data = await response.json()
				setImages(data.data || [])
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error")
			} finally {
				setLoading(false)
			}
		}

		fetchGallery()
	}, [auth.user?.id_token])

	if (loading) return <div>Loading gallery...</div>
	if (error) return <div>Error: {error}</div>

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
			{images.map((img) => (
				<div key={img.id} className="card bg-base-200 shadow-sm w-full">
					<a
						href={img.url}
						target="_blank"
						rel="noopener noreferrer"
						className="block"
					>
						<figure className="bg-base-300 aspect-4/3 flex items-center justify-center overflow-hidden hover:opacity-90 transition-opacity">
							<img
								src={img.url}
								alt={img.title || "Fractal image"}
								className="object-contain w-full h-full"
							/>
						</figure>
					</a>
					<div className="card-body">
						<h2 className="card-title">{img.title || `Image #${img.id}`}</h2>
						{img.description && (
							<p className="text-sm opacity-70">{img.description}</p>
						)}
					</div>
				</div>
			))}
		</div>
	)
}
