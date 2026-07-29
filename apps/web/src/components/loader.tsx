import { BeachBallIcon } from "@phosphor-icons/react/dist/ssr";

export default function Loader() {
	return (
		<div className="flex h-full items-center justify-center pt-8">
			<BeachBallIcon className="animate-spin" />
		</div>
	);
}
