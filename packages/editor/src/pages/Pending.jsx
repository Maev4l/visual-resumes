// Shown after sign-in if the user is authenticated but not yet in the approved Cognito group.
// WHY a dedicated page: the Hosted-UI redirect will succeed for any valid pool user, so the
// group-gated 403 from the API is the earliest signal we have that the account needs manual
// approval — better to surface that calmly than to let the Dashboard show an error card.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Pending = () => (
  <main className="min-h-screen grid place-items-center p-6">
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Pending approval</CardTitle>
        <CardDescription>
          Your account is awaiting approval by the admin. You&apos;ll get access once you&apos;re added to the
          <code className="mx-1 px-1 rounded bg-muted">visual-resumes</code>
          group in Cognito.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">An SNS notification has been sent to the admin automatically.</p>
      </CardContent>
    </Card>
  </main>
);

export default Pending;
