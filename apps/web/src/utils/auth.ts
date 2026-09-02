/** "The Shore Group" → "TSG" — for avatars and the sidebar. */
export function getOrgShortName(orgName: string) {
	const splitBySpace = orgName.split(" ");

	if (splitBySpace.length > 2) {
		return splitBySpace
			.map((word) => word.at(0))
			.join("")
			.slice(0, 3);
	}
	return orgName.slice(0, 3);
}
