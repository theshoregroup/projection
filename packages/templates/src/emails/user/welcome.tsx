import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Link,
	Preview,
	Row,
	Section,
	Text,
} from "react-email";
import z from "zod";
import { GeistFont, TailwindWrapper } from "../../components/tailwind";

const userInviteEmailSchema = z.object({
	key: z.literal("user-welcome"),
	data: z.object({
		verifyAccountUrl: z.url().optional(),
		accountCreatedAt: z.date(),
		thisEmail: z.email(),
		inviteeName: z.string(),
	}),
});

type Props = z.infer<typeof userInviteEmailSchema>["data"];

function Email({
	accountCreatedAt,
	thisEmail,
	inviteeName,
	verifyAccountUrl,
}: Props) {
	return (
		<Html lang="en">
			<Head>
				<GeistFont />
			</Head>

			<TailwindWrapper>
				<Preview>
					Welcome to projection! Login to your new account to get started.
				</Preview>

				<Body className="bg-muted font-sans text-base">
					<Container className="text-center">
						<Heading className="mx-auto">projection</Heading>
					</Container>
					<Container className="rounded-xl bg-white px-10 py-6">
						<Row>
							<Text className="text-base">
								Congratulations! You're one step closer to managing your supply
								chain.
							</Text>

							<Text className="text-base">Here's how to get started:</Text>
						</Row>

						{verifyAccountUrl ? (
							<Section>
								<Link
									href={verifyAccountUrl}
									className="rounded-lg bg-primary px-[18px] py-3 text-primary-foreground"
								>
									Verify your email
								</Link>
							</Section>
						) : null}

						<Container className="mt-6">
							<Text className="text-muted-foreground text-sm">
								You're reciving this email because {inviteeName} registered{" "}
								{thisEmail} on projection at{" "}
								{accountCreatedAt.toLocaleDateString()} - if this wasn't you,
								you can ignore this email.
							</Text>
						</Container>
					</Container>
					<Container className="mt-6 px-6">
						<Heading>cibi</Heading>
						<Text className="text-muted-foreground text-xs">
							cibi projection is a part of cibi industries ltd, a UK company
							with company number 01923.
						</Text>
					</Container>
				</Body>
			</TailwindWrapper>
		</Html>
	);
}

Email.schema = userInviteEmailSchema;
Email.subject = "Welcome to projection";
Email.PreviewProps = {
	inviteeName: "Liam Doyle",
	accountCreatedAt: new Date(),
	verifyAccountUrl: "https://example.com",
	thisEmail: "liamdoyle@trackit.supply",
} satisfies Props;
export default Email;
