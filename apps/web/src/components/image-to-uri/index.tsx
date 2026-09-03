import { Button } from "@projection/ui/components/button";
import { Input } from "@projection/ui/components/input";
import { useCallback, useRef, useState } from "react";

/** Fetch an image URL and convert it to a PNG data URI via canvas. */
async function urlToDataUri(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Could not get canvas context"));
				return;
			}
			ctx.drawImage(img, 0, 0);
			resolve(canvas.toDataURL("image/png"));
		};
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = url;
	});
}

/** Convert a File to a data URI. */
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

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

export function ImageToUri({
	onChange,
}: {
	onChange: (dataUri: string) => void;
}) {
	const [dataUri, setDataUri] = useState<string | null>(null);
	const [urlInput, setUrlInput] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleUrlSubmit = useCallback(async () => {
		const url = urlInput.trim();
		if (!url) return;
		setError(null);
		setLoading(true);
		try {
			const uri = await urlToDataUri(url);
			setDataUri(uri);
		} catch {
			setError("Could not load image from that URL.");
		} finally {
			setLoading(false);
		}
	}, [urlInput]);

	const handleFile = useCallback(async (file: File) => {
		if (!ACCEPTED_TYPES.includes(file.type)) {
			setError("Only PNG and JPEG images are supported.");
			return;
		}
		setError(null);
		setLoading(true);
		try {
			const uri = await fileToDataUri(file);
			setDataUri(uri);
		} catch {
			setError("Failed to process the uploaded image.");
		} finally {
			setLoading(false);
		}
	}, []);

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

	const handleSave = useCallback(() => {
		if (dataUri) {
			onChange(dataUri);
		}
	}, [dataUri, onChange]);

	const handleReset = useCallback(() => {
		setDataUri(null);
		setUrlInput("");
		setError(null);
	}, []);

	// If we have a converted image, show preview + save
	if (dataUri) {
		return (
			<div className="flex flex-col gap-3">
				<div className="mx-auto flex size-32 items-center justify-center overflow-hidden rounded-lg border">
					<img
						src={dataUri}
						alt="Logo preview"
						className="max-h-full max-w-full object-contain"
					/>
				</div>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="default"
						size="sm"
						onClick={handleSave}
						className="flex-1"
					>
						Save logo
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleReset}
					>
						Back
					</Button>
				</div>
			</div>
		);
	}

	// Initial state: paste URL or upload/drop
	return (
		<div className="flex flex-col gap-3">
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

			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<div className="h-px flex-1 bg-border" />
				or
				<div className="h-px flex-1 bg-border" />
			</div>

			<div
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/50"
				onClick={() => fileInputRef.current?.click()}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						fileInputRef.current?.click();
					}
				}}
			>
				<span className="text-sm text-muted-foreground">
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
						e.target.value = "";
					}}
				/>
			</div>

			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}