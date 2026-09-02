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

const orgInviteEmailSchema = z.object({
	key: z.literal("org-invite"),
	data: z.object({
		organizationName: z.string(),
		inviterName: z.string(),
		inviteeEmail: z.email(),
		acceptUrl: z.url(),
	}),
});

type Props = z.infer<typeof orgInviteEmailSchema>["data"];

function Email({ organizationName, inviterName, inviteeEmail, acceptUrl }: Props) {
	return (
		<Html lang="en">
			<Head>
				<GeistFont />
			</Head>

			<TailwindWrapper>
				<Preview>
					{inviterName} invited you to join {organizationName} on projection.
				</Preview>

				<Body className="bg-muted font-sans text-base">
					<Container className="text-center">
						<Heading className="mx-auto">projection</Heading>
					</Container>
					<Container className="rounded-xl bg-white px-10 py-6">
						<Row>
							<Text className="text-base">
								{inviterName} has invited <strong>{inviteeEmail}</strong> to
								join <strong>{organizationName}</strong> on projection.
							</Text>

							<Text className="text-base">
								Sign in with your work Microsoft account, then accept the
								invitation to get started.
							</Text>
						</Row>

						<Section>
							<Link
								href={acceptUrl}
								className="rounded-lg bg-primary px-[18px] py-3 text-primary-foreground"
							>
								Review your invitation
							</Link>
						</Section>

						<Container className="mt-6">
							<Text className="text-muted-foreground text-sm">
								If you weren't expecting this invite, you can ignore this
								email — nothing happens until you accept it.
							</Text>
						</Container>
					</Container>
				</Body>
			</TailwindWrapper>
		</Html>
	);
}

Email.schema = orgInviteEmailSchema;
Email.subject = "You've been invited to join the team on projection";
Email.PreviewProps = {
	organizationName: "The Shore Group",
	inviterName: "Liam Doyle",
	inviteeEmail: "caitlin@theshoregroup.org",
	acceptUrl: "https://projection.example.com/auth/v1/invites?inviteId=00000000-0000-0000-0000-000000000000",
} satisfies Props;
export default Email;
