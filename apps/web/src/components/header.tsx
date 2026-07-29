import { Link } from "@tanstack/react-router";

import UserMenu from "./user-menu";

export default function Header() {
	return (
		<div className="flex flex-row items-center justify-between px-4 py-2">
			<Link to="/" className="font-semibold text-lg">
				projection
			</Link>
			<UserMenu />
		</div>
	);
}
