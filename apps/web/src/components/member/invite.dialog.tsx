import { organizationRoleNames } from "@projection/auth/organization/permissions";
import { Button } from "@projection/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@projection/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@projection/ui/components/field";
import { Input } from "@projection/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@projection/ui/components/select";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod/v4";
import { authClient } from "@/lib/auth-client";

const inviteMemberSchema = z.object({
	email: z.email(),
	role: z.enum(organizationRoleNames as ["owner", "admin", "member"]),
});

/**
 * Invite someone to the organization (the only way new users join —
 * ADR 0008). Existing users are auto-accepted instantly; others get an
 * email with a link to the accept/decline page.
 */
export function InviteMemberDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationKey: ["member", "invite"],
		mutationFn: async (values: z.infer<typeof inviteMemberSchema>) => {
			const { data, error } = await authClient.organization.inviteMember({
				email: values.email,
				role: values.role,
			});

			if (error) throw error;

			return data;
		},
		onMutate: (vars) =>
			toast.loading(`Inviting ${vars.email}...`, {
				id: `invite_${vars.email}`,
			}),
		onError: (err, vars) =>
			toast.error(`Failed to invite ${vars.email}`, {
				id: `invite_${vars.email}`,
				description: err.message,
			}),
		onSuccess: (data, vars) => {
			toast.success(`Invitation sent to ${data.email}`, {
				id: `invite_${data.email}`,
			});
			void vars;
			onOpenChange(false);
			void queryClient.invalidateQueries({ queryKey: ["getMembers"] });
			void queryClient.invalidateQueries({ queryKey: ["invitations"] });
		},
	});

	const form = useForm({
		defaultValues: {
			email: "",
			role: "member" as z.infer<typeof inviteMemberSchema>["role"],
		},
		validators: {
			onSubmit: inviteMemberSchema,
		},
		onSubmit: async ({ value, formApi }) => {
			await mutation.mutateAsync(value);
			// React-form 1.x FormApi has no bulk setValues — reset per field
			formApi.setFieldValue("email", "");
			formApi.setFieldValue("role", "member");
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite a member</DialogTitle>
				</DialogHeader>

				<form
					id={form.formId}
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="email">
						{(field) => {
							const isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid;
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Email</FieldLabel>
									<FieldDescription>
										The work email of the person you want to invite.
									</FieldDescription>

									<Input
										id={field.name}
										type="email"
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
										autoComplete="off"
										placeholder="name@company.com"
									/>
									{isInvalid && (
										<FieldError errors={field.state.meta.errors ?? []} />
									)}
								</Field>
							);
						}}
					</form.Field>

					<form.Field name="role">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Role</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={(v) =>
										typeof v === "string" && field.handleChange(v)
									}
								>
									<SelectTrigger id={field.name} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{organizationRoleNames.map((role) => (
											<SelectItem key={role} value={role}>
												{role}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>

					<DialogFooter>
						<Button
							data-loading={mutation.isPending || undefined}
							type="submit"
						>
							Send invite
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
