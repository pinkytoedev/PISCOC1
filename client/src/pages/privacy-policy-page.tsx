import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">Privacy Policy</CardTitle>
          <CardDescription>Last updated: {new Date().toLocaleDateString()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h2 className="text-2xl font-semibold text-primary">Introduction</h2>
            <p className="mt-2 text-muted-foreground">
              Thank you for using our platform. This Privacy Policy explains how we collect, use, disclose, 
              and safeguard your information when you use our service. We respect your privacy and are committed 
              to protecting your personal data.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Information We Collect</h2>
            <p className="mt-2 text-muted-foreground">We collect several types of information for various purposes to provide and improve our service to you:</p>
            <ul className="mt-2 list-disc pl-5 space-y-2 text-muted-foreground">
              <li>
                <strong>Personal Information:</strong> Name, email address, and profile information you provide directly.
              </li>
              <li>
                <strong>Account Information:</strong> Login credentials and account preferences.
              </li>
              <li>
                <strong>Social Media Information:</strong> When you connect to social media platforms like Instagram and Facebook, 
                we store authentication tokens to provide integration features. This allows us to publish content and retrieve information 
                from these platforms on your behalf.
              </li>
              <li>
                <strong>Content Data:</strong> Information related to the content you create, upload, publish, or share through our service.
              </li>
              <li>
                <strong>Usage Data:</strong> Information on how you access and use our service, including log data and analytics information.
              </li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">How We Use Your Information</h2>
            <p className="mt-2 text-muted-foreground">We use the collected information for various purposes, including:</p>
            <ul className="mt-2 list-disc pl-5 space-y-2 text-muted-foreground">
              <li>Providing and maintaining our service</li>
              <li>Managing your account and providing you with customer support</li>
              <li>Enabling social media integrations as requested by you</li>
              <li>Publishing content to connected social media platforms</li>
              <li>Analyzing usage patterns to improve our service</li>
              <li>Detecting and preventing fraudulent or unauthorized activity</li>
              <li>Sending service-related notifications and updates</li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Social Media Integration</h2>
            <p className="mt-2 text-muted-foreground">
              Our service allows you to connect with third-party social media platforms, including Instagram and Facebook. 
              When you choose to connect, we:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-2 text-muted-foreground">
              <li>Store authentication tokens necessary for providing the integration</li>
              <li>May retrieve information about your social media profile and content</li>
              <li>May publish content to your social media accounts based on your actions in our service</li>
              <li>Receive and process webhook notifications from connected platforms</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              You may disconnect your social media accounts at any time through your account settings. 
              However, this will not delete any content already published through our service.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Data Sharing and Disclosure</h2>
            <p className="mt-2 text-muted-foreground">
              We do not sell your personal information. We may share your information in the following circumstances:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-2 text-muted-foreground">
              <li>
                <strong>With Service Providers:</strong> We may share your information with third-party vendors and service providers 
                who perform services for us or on our behalf.
              </li>
              <li>
                <strong>With Connected Platforms:</strong> When you connect to social media platforms, we share information as necessary 
                to facilitate the integration.
              </li>
              <li>
                <strong>For Legal Compliance:</strong> We may disclose your information where required by law or to protect our rights.
              </li>
              <li>
                <strong>With Your Consent:</strong> We may share your information for other purposes with your explicit consent.
              </li>
            </ul>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Data Security</h2>
            <p className="mt-2 text-muted-foreground">
              We implement appropriate technical and organizational measures to protect your personal information from unauthorized access, 
              accidental loss, alteration, or disclosure. However, no method of transmission over the Internet or electronic storage is 100% secure, 
              and we cannot guarantee absolute security.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Your Data Rights</h2>
            <p className="mt-2 text-muted-foreground">
              Depending on your location, you may have certain rights regarding your personal information, including:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-2 text-muted-foreground">
              <li>The right to access your personal information</li>
              <li>The right to correct inaccurate or incomplete information</li>
              <li>The right to delete your personal information</li>
              <li>The right to restrict or object to processing of your information</li>
              <li>The right to data portability</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              To exercise these rights, please contact us at the email address provided in the "Contact Us" section.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Children's Privacy</h2>
            <p className="mt-2 text-muted-foreground">
              Our service is not intended for individuals under the age of 16. We do not knowingly collect personal 
              information from children. If we become aware that we have collected personal information from a child 
              without verification of parental consent, we will take steps to remove that information.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Changes to This Privacy Policy</h2>
            <p className="mt-2 text-muted-foreground">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new 
              Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy 
              periodically for any changes.
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="text-2xl font-semibold text-primary">Contact Us</h2>
            <p className="mt-2 text-muted-foreground">
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <p className="mt-2 font-medium">
              Email: privacy@example.com
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}