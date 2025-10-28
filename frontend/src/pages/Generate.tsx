import { useState } from "react"
import { useAuth } from "react-oidc-context"
import { API_URL } from "../main"

interface FractalParams {
	width: number
	height: number
	iterations: number
	power: number
	real: number
	imag: number
	scale: number
	offsetX: number
	offsetY: number
	color: string
}

interface FractalResult {
	url: string
}

interface FractalError {
	error: string
}

export default function Generate() {
	const auth = useAuth()
	const [params, setParams] = useState<FractalParams>({
		width: 1920,
		height: 1080,
		iterations: 500,
		power: 2,
		real: 0.285,
		imag: 0.01,
		scale: 1,
		offsetX: 0,
		offsetY: 0,
		color: "rainbow",
	})
	const [result, setResult] = useState<FractalResult | FractalError | null>(
		null,
	)
	const [loading, setLoading] = useState(false)

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setLoading(true)
		setResult(null)

		try {
			const stringParams: Record<string, string> = {}
			for (const [key, value] of Object.entries(params)) {
				stringParams[key] = String(value)
			}
			const queryParams = new URLSearchParams(stringParams).toString()
			const response = await fetch(`${API_URL}/api/fractal?${queryParams}`, {
				headers: {
					Authorization: `Bearer ${auth.user?.id_token}`,
				},
			})
			const data = await response.json()
			setResult(data)
		} catch (error) {
			setResult({
				error: error instanceof Error ? error.message : "Unknown error",
			})
		} finally {
			setLoading(false)
		}
	}

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
	) => {
		const { name, value } = e.target
		setParams((prev) => ({ ...prev, [name]: value }))
	}

	return (
		<div className="flex flex-col lg:flex-row gap-4 w-full">
			<form onSubmit={handleSubmit}>
				<fieldset className="fieldset bg-base-200 border-base-300 rounded-box w-full border p-4">
					<legend className="fieldset-legend">Parameters</legend>
					<label htmlFor="width" className="label">
						Width
					</label>
					<input
						id="width"
						type="number"
						name="width"
						value={params.width}
						onChange={handleChange}
						className="input w-full"
					/>
					<label htmlFor="height" className="label">
						Height
					</label>
					<input
						id="height"
						type="number"
						name="height"
						value={params.height}
						onChange={handleChange}
						className="input w-full"
					/>
					<label htmlFor="iterations" className="label">
						Iterations
					</label>
					<input
						id="iterations"
						type="number"
						name="iterations"
						value={params.iterations}
						onChange={handleChange}
						className="input w-full"
					/>
					<label htmlFor="real" className="label">
						Real
					</label>
					<input
						id="real"
						type="number"
						step="0.001"
						name="real"
						value={params.real}
						onChange={handleChange}
						className="input w-full"
					/>
					<label htmlFor="imag" className="label">
						Imaginary
					</label>
					<input
						id="imag"
						type="number"
						step="0.001"
						name="imag"
						value={params.imag}
						onChange={handleChange}
						className="input w-full"
					/>
					<label htmlFor="color" className="label">
						Color
					</label>
					<select
						id="color"
						name="color"
						value={params.color}
						onChange={handleChange}
						className="select w-full"
					>
						<option value="rainbow">Rainbow</option>
						<option value="grayscale">Grayscale</option>
						<option value="fire">Fire</option>
					</select>
					<button
						type="submit"
						className="btn btn-neutral mt-4"
						disabled={loading}
					>
						{loading ? "Generating..." : "Generate Fractal"}
					</button>
				</fieldset>
			</form>
			<fieldset className="fieldset bg-base-200 border-base-300 rounded-box w-full flex border p-4">
				<legend className="fieldset-legend">Result</legend>
				{result && "url" in result && (
					<div>
						<img
							src={result.url}
							alt="Generated fractal"
							className="max-w-full h-auto rounded"
						/>
					</div>
				)}
				{result && "error" in result && (
					<div className="text-error">{result.error}</div>
				)}
			</fieldset>
		</div>
	)
}
