import { env } from "@projection/env/server";
import ProjectInviteEmail from "@projection/templates/email/project/invite";
import UserWelcomeEmail from "@projection/templates/email/user/welcome";
import { render, toPlainText } from "@react-email/render";

import { AbortTaskRunError, queue, retry, schemaTask } from "@trigger.dev/sdk";
import { Resend } from "resend";
import { z } from "zod";

const resend = new Resend(env.RESEND_API_KEY);

export const resendQueue = queue({
	name: "resend",
	concurrencyLimit: 15,
});

type EmailSchema<TData> = z.ZodObject<{
	key: z.ZodLiteral<string>;
	data: z.ZodType<TData>;
}>;

type EmailComponent<TData> = ((data: TData) => React.ReactElement) & {
	schema: EmailSchema<TData>;
};

type TemplateEntry = {
	// biome-ignore lint/suspicious/noExplicitAny: typing
	schema: EmailSchema<any>;
	renderWithProps: (props: {
		key: string;
		data: unknown;
	}) => React.ReactElement;
};

function registerEmail<TData>(component: EmailComponent<TData>): TemplateEntry {
	return {
		schema: component.schema,
		renderWithProps: (rawProps) => {
			const { data } = component.schema.parse(rawProps);
			return component(data);
		},
	};
}

const emailRegistry = [
	registerEmail(UserWelcomeEmail),
	registerEmail(ProjectInviteEmail),
];

const emailTemplatesByKey = Object.fromEntries(
	emailRegistry.map((e) => [e.schema.shape.key.value, e]),
);

const singleOrArrayOfEmails = z.email().or(z.email().array());

const typeSafeEmails = z.enum([
	"Onboarding <onboarding@projection.com>",
	"Accounts <accounts@projection.com>",
	"Signing <signing@projection.com>",
]);

const emailTaskSchema = z.object({
	from: typeSafeEmails.or(z.email()).catch("fallback@dev.trackit.supply"),
	to: singleOrArrayOfEmails,
	bcc: singleOrArrayOfEmails.optional(),
	cc: singleOrArrayOfEmails.optional(),
	subject: z.string().min(2),

	props: z.discriminatedUnion("key", [
		UserWelcomeEmail.schema,
		ProjectInviteEmail.schema,
	]),
});

export const sendEmail = schemaTask({
	id: "email.send",
	queue: resendQueue,
	schema: emailTaskSchema,
	run: async ({ props, ...emailPayload }, params) => {
		const getEmailProps = async () => {
			const template = emailTemplatesByKey[props.key];

			if (!template) {
				throw new AbortTaskRunError(
					`Key "${props.key}" doesn't correspond to any valid email`,
				);
			}

			const html = await render(template.renderWithProps(props));
			const text = toPlainText(html);

			return { html, text };
		};

		const resendResult = await retry.onThrow(
			async () => {
				const { html, text } = await getEmailProps();

				const { data, error } = await resend.emails.send(
					{
						...emailPayload,
						html,
						text,
					},
					{ idempotencyKey: params.ctx.run.id },
				);

				if (error) {
					// Treat 5xx/429 as retryable, typical 4xx as non-retryable
					const msg = String(error.message ?? error);
					const code = Number(error.statusCode ?? 0);
					const retryable =
						code === 429 ||
						(code >= 500 && code <= 599) ||
						/timeout/i.test(msg);

					if (!retryable) {
						// Don’t keep retrying on hard failures (e.g., invalid recipient)
						throw new AbortTaskRunError(
							`Non-retryable send error (${code}): ${msg}`,
						);
					}

					// Throw to use task/backoff retries
					throw new Error(`Retryable send error (${code}): ${msg}`);
				}

				return data;
			},
			{
				maxAttempts: 8,
				randomize: true,
				factor: 2.0,
				minTimeoutInMs: 1000,
				maxTimeoutInMs: 60_000,
			},
		);

		return resendResult;
	},
});
