import {
	Body,
	CodeInline,
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

const userVerifyEmailSchema = z.object({
	key: z.literal("user-verify"),
	data: z.object({
		url: z.url(),
		token: z.string(),
		user: z.object({
			name: z.string(),
			email: z.email(),
		}),
	}),
});

type Props = z.infer<typeof userVerifyEmailSchema>["data"];

function Email({ url, token, user }: Props) {
	return (
		<Html lang="en">
			<Head>
				<GeistFont />
			</Head>

			<TailwindWrapper>
				<Preview>Verify your email to get started with projection.</Preview>

				<Body className="bg-muted font-sans text-base">
					<Container className="text-center">
						<Heading className="mx-auto">projection</Heading>
					</Container>
					<Container className="rounded-xl bg-white px-10 py-6">
						<Row>
							<Text className="text-base">We need to verify your email</Text>

							<Text className="text-base">
								Hey {user.name}, we need to verify your email to get started
								with projection.
							</Text>
						</Row>

						<Section>
							<Link
								href={url}
								className="rounded-lg bg-primary px-[18px] py-3 text-primary-foreground"
							>
								Verify your email
							</Link>

							<Text className="text-muted-foreground text-xs">
								Or copy the token below and paste it into the verification
								screen:
							</Text>
							<CodeInline className="bg-accent p-4 font-mono text-lg">
								{token}
							</CodeInline>
						</Section>

						<Container className="mt-6">
							<Text className="text-muted-foreground text-sm">
								You're receiving this email because {user.name} registered{" "}
								{user.email} on projection.
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

Email.schema = userVerifyEmailSchema;
Email.subject = "Verify Your Email";
Email.PreviewProps = {
	token: "d8298DSh",
	url: "https://example.com",
	user: { name: "Liam Doyle", email: "liamdoyle@trackit.supply" },
} satisfies Props;
export default Email;
