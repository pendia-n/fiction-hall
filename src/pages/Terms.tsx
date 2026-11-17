import { Link } from 'react-router-dom';
import { previousTermsPath } from './PreviousTerms';

const publishedAt = '2026-11-17T05:23-05:00';
const transitionAt = '2026-12-18T00:00-05:00';
const transitionDate = 'December 18, 2026';

export function TermsUpdateNotice() {
  if (Date.now() >= Date.parse(transitionAt)) return null;

  return (
    <aside className="terms-update-notice" aria-label="Terms of Service update">
      <Link to="/terms">Updated Terms of Service</Link> for existing accounts take effect no earlier than {transitionDate} (New York time).
    </aside>
  );
}

export function TermsDocument() {
  return (
    <div className="terms-content">
      <h1>Terms of Service</h1>
      <p><strong>Published <time dateTime={publishedAt}>November 17, 2026 at 5:23 AM EST</time> (New York time).</strong></p>
      <p>These Terms of Service are an agreement between you and Pendia LLC, a New Mexico limited liability company operating Jothable. This version applies to new accounts when they accept it at signup. For existing accounts, the previous version applies until at least <time dateTime={transitionAt}>{transitionDate}</time> (New York time), and any acceptance required by law must still be obtained. Earlier purchases remain subject to the terms that applied when they were made.</p>

      <h2>1. Accounts and access</h2>
      <p>You must be at least 16 to use Jothable. If you are under the age of majority where you live, you must have a parent or legal guardian's permission to use the service. Public content can be read without signing in. An account is required to publish, purchase or use certain interactive features. Keep your credentials secure and provide accurate information where required. Payout providers may require identification and verification. Our <Link to="/privacy">Privacy Policy</Link> describes how we handle personal information.</p>

      <h2>2. Creator ownership</h2>
      <p>As between you and Jothable, you retain the copyright and other rights you hold in the stories, illustrations and other works you submit. You may publish the same work elsewhere, subject to your agreements with other rights holders or publishers. By submitting a work, you confirm that you have the rights and permissions needed to submit it and grant the permissions in these terms. This includes rights to material supplied by illustrators, coauthors and other contributors.</p>

      <h2>3. License to operate Jothable</h2>
      <p>For work you submit under these terms, you grant Pendia LLC a nonexclusive, worldwide license to host, store, reproduce, format, display and deliver the work as needed to operate Jothable. We may authorize service providers to exercise those rights on our behalf for those purposes. We use private drafts to provide draft tools and storage. We may make published works available according to their free or paid access settings.</p>
      <p>While a work is available on Jothable, we may use its title, description, cover, your chosen public name and short attributed excerpts to promote the work and Jothable. The public bookmark feature may display short passages selected by readers with access to a published chapter, including paid chapters, along with their reflections and attribution to the work and creator. Excerpt sharing through this feature is limited to Jothable.</p>
      <p>Additional permissions for material you submitted before these terms applied to you require your express agreement. When a work is removed, the license continues only to the extent necessary to honor prior reader access that we are entitled to provide, retain routine backups, resolve disputes or comply with law. We will stop promotional uses under our control within a reasonable time after removal.</p>

      <h2>4. Adaptation and commercial rights</h2>
      <p>You retain the rights you hold to license or sell adaptations and other commercial uses of your work, including film, television, games, translations, clothing, merchandise and theme park attractions. You may negotiate directly with commercial partners. The license in Section 3 covers Jothable's service and the promotion described there.</p>
      <p>If you ask Jothable to help arrange a commercial deal, any representation, authority or commission requires a separate written agreement identifying the work, the services, the scope of authority, the fee and the duration. You decide whether to accept a deal. Publishing a work on Jothable gives Jothable no automatic share of a deal you make elsewhere.</p>
      <p>Before agreeing to rights that may conflict with current availability on Jothable, disclose the existing Jothable license and reader purchases to the other party and contact Jothable about the proposed change. If the new deal leaves your publishing rights intact, your work can remain available. If the deal includes conflicting publishing rights, continued access depends on the applicable agreements and law.</p>

      <h2>5. Purchases, platform fees and payouts</h2>
      <p>Creators set collection prices within the limits shown by Jothable. For Stripe collection sales, Jothable charges 5% of the purchase price for one-year access and 10% for permanent access. Creators and readers are subject to any applicable payment provider terms. We will disclose any other fees charged by Jothable and any change to our platform fees before they apply to future sales. Payouts may be affected by payment provider fees, refunds, disputes, or applicable taxes and withholding.</p>
      <p>Checkout states the price and type of access. A purchase grants personal reading access to the collection for the period described at checkout. It does not transfer copyright or adaptation rights. Purchases are generally final. This policy is subject to applicable law and any refund rights stated at checkout. If access is interrupted or a work must be removed, any applicable rights and remedies remain available.</p>

      <h2>6. Acceptable use and enforcement</h2>
      <p>Subject to permissions from the rights holder, uses expressly permitted by Jothable's features and applicable law, you may not copy, scrape, redistribute, republish, sell or adapt another creator's work. The restriction applies to free and paid works. Do not upload material that infringes another party's rights or misuse accounts or payment features.</p>
      <p>Jothable may restrict content or accounts to address infringement, unlawful activity, security risks or violations of these terms. We may temporarily suspend access while reviewing a report and suspend or terminate accounts of repeat infringers in appropriate circumstances. The normal publishing tools do not permit editing or deleting a published chapter.</p>

      <h2>7. Copyright complaints</h2>
      <p>If you own rights in material that you believe was copied on Jothable, a report should identify the original work, provide the URL of the material on Jothable, include your contact information and explain why you believe the use is unauthorized. We may review reports we receive, request further information, notify the uploader and consider responses in accordance with applicable law.</p>
      <p>If an unauthorized copy appears on another service, the rights holder or their authorized representative can contact that service. Jothable may assist with an off-site complaint at the rights holder's request.</p>

      <h2>8. Service availability and liability</h2>
      <p>Jothable may experience interruptions and may change features as the service evolves. To the extent permitted by law, Pendia LLC excludes liability for indirect, incidental, special and consequential damages arising from use of the service. This limitation does not reduce amounts owed for creator payouts, refund obligations or liability that cannot lawfully be limited.</p>

      <h2>9. Governing law and changes</h2>
      <p>New Mexico law governs these terms, subject to applicable U.S. federal law and mandatory protections that apply where you live. Nothing in these terms waives a right or remedy that cannot lawfully be waived.</p>
      <p>For material changes, Jothable will provide at least 30 days' notice through a prominent notice on the service or another appropriate channel. We will state when the change is scheduled to apply and obtain consent where required by law.</p>
    </div>
  );
}

export default function Terms() {
  return (
    <div className="editorial-page info-page legal-page card">
      <TermsDocument />
      <p><Link to={previousTermsPath}>View previous Terms of Service</Link></p>
    </div>
  );
}
