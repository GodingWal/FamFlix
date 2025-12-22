import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError } from "@/lib/queryClient";

const leadSchema = z.object({
  name: z.string().min(2, "Please tell us your name"),
  email: z.string().email("Enter a valid email"),
  familySize: z
    .coerce
    .number({ invalid_type_error: "Family size must be a number" })
    .int("Family size should be a whole number")
    .min(1, "At least one family member")
    .max(20, "Please contact us for larger families"),
  message: z.string().min(10, "Share a few details so we can help"),
});

type LeadFormValues = z.infer<typeof leadSchema>;

export default function Contact() {
  const { toast } = useToast();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: "",
      email: "",
      familySize: 4,
      message: "",
    },
  });

  const leadMutation = useMutation({
    mutationFn: async (data: LeadFormValues) => {
      const response = await apiRequest("POST", "/api/marketing/leads", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      form.reset({
        name: "",
        email: "",
        familySize: 4,
        message: "",
      });

      toast({
        title: "Thanks for reaching out!",
        description: data?.message ?? "Our team will get in touch soon.",
      });
    },
    onError: (error: unknown) => {
      const description = error instanceof ApiError ? error.message : "We couldn't send your message. Please try again.";
      toast({
        title: "Submission failed",
        description,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: LeadFormValues) => {
    leadMutation.mutate(values);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-16 space-y-10">
        <header className="space-y-4 text-center md:text-left">
          <h1 className="text-4xl font-bold">Let&apos;s plan your family&apos;s next premiere</h1>
          <p className="text-muted-foreground text-lg">
            Share a few details about your crew and we&apos;ll help you pick the perfect FamFlix experience.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardContent className="p-6 sm:p-10">
            <Form {...form}>
              <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your name</FormLabel>
                        <FormControl>
                          <Input placeholder="Alex Johnson" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="familySize"
                  render={({ field }) => (
                    <FormItem className="md:w-1/3">
                      <FormLabel>Family size</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={20} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How can we help?</FormLabel>
                      <FormControl>
                        <Textarea rows={5} placeholder="Tell us about your project, timeline, or any questions you have." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    We respond within one business day. Looking for enterprise options? Mention it in your message.
                  </p>
                  <Button type="submit" size="lg" disabled={leadMutation.isPending}>
                    {leadMutation.isPending ? "Sending..." : "Send message"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
