import {
	PencilIcon,
	PlusIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@projection/ui/components/button";
import { Input } from "@projection/ui/components/input";
import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Helpers

/** Fetch an image from a URL and convert it to a PNG data URI via canvas. */
async function urlToDataUri(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			const dataUri = imageToDataUri(img);
			resolve(dataUri);
		};
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = url;
	});
}

/** Convert an already-loaded HTMLImageElement to a PNG data URI. */
function imageToDataUri(img: HTMLImageElement): string {
	const canvas = document.createElement("canvas");
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(img, 0, 0);
	return canvas.toDataURL("image/png");
}

/** Convert a File (from upload or drop) to a data URI. */
function fileToDataUri(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
			} else {
				reject(new Error("FileReader did not return a string"));
			}
		};
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

/** Load a data URI into an HTMLImageElement to get dimensions, etc. */
function loadDataUriAsImage(dataUri: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Failed to load image from data URI"));
		img.src = dataUri;
	});
}

/**
 * Render the editor canvas: draw the image centred on a square canvas with
 * an optional background fill colour, and return the final data URI.
 */
async function renderCroppedCanvas(
	sourceDataUri: string,
	outputSize: number,
	bgColor: string,
): Promise<string> {
	const img = await loadDataUriAsImage(sourceDataUri);
	const canvas = document.createElement("canvas");
	canvas.width = outputSize;
	canvas.height = outputSize;
	const ctx = canvas.getContext("2d")!;

	// Fill background
	ctx.fillStyle = bgColor;
	ctx.fillRect(0, 0, outputSize, outputSize);

	// Scale image to fit within the square (contain)
	const scale = Math.min(
		outputSize / img.naturalWidth,
		outputSize / img.naturalHeight,
	);
	const w = img.naturalWidth * scale;
	const h = img.naturalHeight * scale;
	const x = (outputSize - w) / 2;
	const y = (outputSize - h) / 2;
	ctx.drawImage(img, x, y, w, h);

	return canvas.toDataURL("image/png");
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const OUTPUT_SIZE = 512;

// ---------------------------------------------------------------------------
// States

type Step = "pick" | "edit";

// ---------------------------------------------------------------------------
// Component

export function ImageToUri({
	value,
	onChange,
}: {
	value: string | undefined;
	onChange: (value: string) => void;
}) {
	const [step, setStep] = useState<Step>(value ? "edit" : "pick");
	const [sourceDataUri, setSourceDataUri] = useState<string | null>(
		value ?? null,
	);
	const [previewDataUri, setPreviewDataUri] = useState<string | null>(
		value ?? null,
	);
	const [bgColor, setBgColor] = useState("#ffffff");
	const [urlInput, setUrlInput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dropRef = useRef<HTMLDivElement>(null);

	// Re-render preview whenever bgColor changes (if we have a source image)
	const updatePreview = useCallback(async (source: string, bg: string) => {
		try {
			const result = await renderCroppedCanvas(source, OUTPUT_SIZE, bg);
			setPreviewDataUri(result);
		} catch {
			// If re-render fails (e.g. tainted canvas), just use the source
			setPreviewDataUri(source);
		}
	}, []);

	const handleBgColorChange = useCallback(
		(bg: string) => {
			setBgColor(bg);
			if (sourceDataUri) {
				updatePreview(sourceDataUri, bg);
			}
		},
		[sourceDataUri, updatePreview],
	);

	// ---- URL input handling ----

	const handleUrlSubmit = useCallback(async () => {
		if (!urlInput.trim()) return;
		setError(null);
		setLoading(true);
		try {
			const dataUri = await urlToDataUri(urlInput.trim());
			setSourceDataUri(dataUri);
			await updatePreview(dataUri, bgColor);
			setStep("edit");
		} catch {
			setError(
				"Could not load image from that URL. Make sure it's publicly accessible.",
			);
		} finally {
			setLoading(false);
		}
	}, [urlInput, bgColor, updatePreview]);

	// ---- File upload / drop handling ----

	const handleFile = useCallback(
		async (file: File) => {
			if (!ACCEPTED_TYPES.includes(file.type)) {
				setError("Only PNG and JPEG images are supported.");
				return;
			}
			setError(null);
			setLoading(true);
			try {
				const dataUri = await fileToDataUri(file);
				setSourceDataUri(dataUri);
				await updatePreview(dataUri, bgColor);
				setStep("edit");
			} catch {
				setError("Failed to process the uploaded image.");
			} finally {
				setLoading(false);
			}
		},
		[bgColor, updatePreview],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const file = e.dataTransfer.files[0];
			if (file) handleFile(file);
		},
		[handleFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	// ---- Save / clear ----

	const handleSave = useCallback(() => {
		if (previewDataUri) {
			onChange(previewDataUri);
		}
	}, [previewDataUri, onChange]);

	const handleClear = useCallback(() => {
		onChange("");
		setSourceDataUri(null);
		setPreviewDataUri(null);
		setUrlInput("");
		setBgColor("#ffffff");
		setError(null);
		setStep("pick");
	}, [onChange]);

	// ---- Edit step: image loaded, user can adjust bg and save ----

	if (step === "edit" && previewDataUri) {
		return (
			<div className="flex flex-col gap-3">
				{/* Preview: square image on the chosen background colour */}
				<div
					className="relative mx-auto flex size-40 items-center justify-center overflow-hidden rounded-lg border"
					style={{ backgroundColor: bgColor }}
				>
					<img
						src={previewDataUri}
						alt="Logo preview"
						className="max-h-full max-w-full object-contain"
					/>
				</div>

				{/* Background colour picker */}
				<label className="flex items-center gap-2 text-muted-foreground text-sm">
					Background colour
					<input
						type="color"
						value={bgColor}
						onChange={(e) => handleBgColorChange(e.target.value)}
						className="size-6 cursor-pointer rounded border border-border"
					/>
				</label>

				{/* Actions */}
				<div className="flex gap-2">
					<Button
						type="button"
						variant="default"
						size="sm"
						onClick={handleSave}
						className="flex-1"
					>
						<PlusIcon weight="bold" />
						Save logo
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleClear}
					>
						<TrashIcon />
						Remove
					</Button>
				</div>
			</div>
		);
	}

	// ---- Pick step: paste URL or upload/drop an image ----

	return (
		<div className="flex flex-col gap-3">
			{/* URL paste */}
			<div className="flex gap-2">
				<Input
					value={urlInput}
					onChange={(e) => {
						setUrlInput(e.target.value);
						setError(null);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleUrlSubmit();
					}}
					placeholder="https://example.com/logo.png"
					autoCorrect="off"
					autoFocus={false}
				/>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={handleUrlSubmit}
					disabled={loading || !urlInput.trim()}
				>
					{loading ? "Loading…" : "Load"}
				</Button>
			</div>

			{/* Divider */}
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				<div className="h-px flex-1 bg-border" />
				or
				<div className="h-px flex-1 bg-border" />
			</div>

			{/* Upload / drop zone */}
			<div
				ref={dropRef}
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/50"
				onClick={() => fileInputRef.current?.click()}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						fileInputRef.current?.click();
					}
				}}
			>
				<PencilIcon className="size-5 text-muted-foreground" />
				<span className="text-muted-foreground text-sm">
					Drop a PNG or JPEG image, or click to browse
				</span>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg"
					className="hidden"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) handleFile(file);
						// Reset so the same file can be re-selected
						e.target.value = "";
					}}
				/>
			</div>

			{error && <p className="text-destructive text-sm">{error}</p>}

			{value && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleClear}
					className="self-start text-muted-foreground"
				>
					<XIcon />
					Remove current logo
				</Button>
			)}
		</div>
	);
}
