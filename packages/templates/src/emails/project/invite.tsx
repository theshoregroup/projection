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

const projectInviteEmailSchema = z.object({
	key: z.literal("project-invite"),
	data: z.object({
		inviterName: z.string(),
		projectName: z.string(),
		signInUrl: z.url(),
	}),
});

type Props = z.infer<typeof projectInviteEmailSchema>["data"];

function Email({ inviterName, projectName, signInUrl }: Props) {
	return (
		<Html lang="en">
			<Head>
				<GeistFont />
			</Head>

			<TailwindWrapper>
				<Preview>
					{inviterName} invited you to edit {projectName} on projection.
				</Preview>

				<Body className="bg-muted font-sans text-base">
					<Container className="text-center">
						<Heading className="mx-auto">projection</Heading>
					</Container>
					<Container className="rounded-xl bg-white px-10 py-6">
						<Row>
							<Text className="text-base">
								{inviterName} has invited you to edit the project{" "}
								<strong>{projectName}</strong> on projection.
							</Text>

							<Text className="text-base">
								Sign in with your work Microsoft account and the project will be
								waiting for you under "Shared with me".
							</Text>
						</Row>

						<Section>
							<Link
								href={signInUrl}
								className="rounded-lg bg-primary px-[18px] py-3 text-primary-foreground"
							>
								Sign in with Microsoft
							</Link>
						</Section>

						<Container className="mt-6">
							<Text className="text-muted-foreground text-sm">
								If you weren't expecting this invite, you can ignore this email
								— nothing happens until you sign in.
							</Text>
						</Container>
					</Container>
				</Body>
			</TailwindWrapper>
		</Html>
	);
}

Email.schema = projectInviteEmailSchema;
Email.subject = "You've been invited to edit a project";
Email.PreviewProps = {
	inviterName: "Liam Doyle",
	projectName: "Website relaunch",
	signInUrl: "https://example.com",
} satisfies Props;
export default Email;
