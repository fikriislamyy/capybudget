# AWS EC2 free-tier VPS setup for CapyBudget

Checked against AWS documentation on **2 October 2026**. This guide uses **Amazon EC2**, with Jenkins running locally in a container named `jenkins`. After preparing the server, follow the [Jenkins deployment guide](deployment-jenkins.md).

## 1. Understand the AWS free plan and choose one server

For eligible new customers, AWS provides $100 in initial credits and opportunities to earn up to $100 more. The **Free account plan ends after six months or when credits run out, whichever happens first**. Choosing the Paid plan permits charges beyond credits. Existing or former AWS customers may not qualify for new-customer credits. Check your account's actual plan, credit balance and expiry in Billing before launching anything. [AWS Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/).

The EC2 “Free tier eligible” label does **not** mean unlimited free instance-hours or that a server will run for six months on the initial credit. Accounts created before 15 July 2025 have different legacy rules; do not follow old “750 hours of t2.micro for 12 months” tutorials for a new account. [EC2 eligibility](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html).

Use **one EC2 instance** for the web, API, database, Redis, SeaweedFS and workers. Two servers consume credits faster and add networking/maintenance work. Both `capybudget.bebem.my.id` and `api.capybudget.bebem.my.id` point to the same public IPv4 address. Caddy routes requests to the correct container.

| Instance choice | Recommendation for this repository |
| --- | --- |
| `m7i-flex.large` | Preferred starting point if eligible and available: 2 vCPUs, 8 GiB RAM, x86-64. More headroom for database, workers, Chromium PDFs and image builds; consumes credits faster than a small instance |
| `c7i-flex.large` | Eligible alternative listed by AWS; assess its smaller memory allocation and regional cost before choosing it |
| `t3.small` / `t4g.small` | Lower-cost experiments, but tight for the entire stack plus builds; require memory/workload tuning. T4g needs ARM64 images |
| Micro instances | Not recommended for this complete stack; do not assume swap makes production PDFs and builds reliable |

The size recommendation is an engineering estimate, not a load-test result. See [M7i-flex specifications](https://aws.amazon.com/ec2/instance-types/m7i/) and the EC2 eligibility link above. Select an eligible instance offered in your actual account/region; do not upgrade to the Paid plan just to unlock a size without reviewing the cost.

Before launch, use the [AWS Pricing Calculator](https://calculator.aws/) for the selected region: Linux On-Demand instance × expected hours, EBS disk, public IPv4, snapshots and data transfer. Estimate credit lifetime as `available credits / estimated daily eligible usage cost`. For illustration only, $100 divided by $3/day lasts about 33 days, not six months. This example is not a price quote. Plan migration or paid hosting before credits expire.

## 2. Create and secure the AWS account

1. Sign up through [AWS Free Tier](https://aws.amazon.com/free/) and choose the **Free account plan** if offered and suitable. Complete the required identity/payment verification.
2. Enable MFA on the root account and keep recovery information safe. Use a separate administrative identity for routine work; do not create root access keys.
3. Choose one region for EC2 and its disk. For Indonesian users, compare Jakarta and Singapore latency, instance availability and prices; use the eligible region that fits your budget. Region selection is not a free-tier guarantee.
4. In Billing and Cost Management, confirm your plan, credited amount and expiry. Create budget/usage alerts and check credit consumption regularly. Alerts are notifications, not a hard spending cap on a Paid account.
5. Tag project resources with `Project=capybudget` and `Environment=production` for cost tracking.
6. Keep the setup to EC2 plus its disk/public IP. Do not add NAT Gateway, load balancers, RDS, Marketplace subscriptions, Savings Plans or Reserved Instances for this initial deployment.

## 3. Create networking and a security group

Use a default VPC with a public subnet if one exists. Otherwise create a VPC, one public subnet and an internet gateway; associate a route table with `0.0.0.0/0` pointing to that gateway. A public subnet also needs a public IP on the instance. When using the VPC wizard, choose **no NAT gateways** and no optional paid endpoints for this setup.

Create a security group named `capybudget-web` in that VPC with these inbound rules:

| Port | Source | Purpose |
| --- | --- | --- |
| TCP 22 | Your home/public IP `/32` | Administrator and local Jenkins SSH |
| TCP 80 | `0.0.0.0/0` | Certificate validation and HTTPS redirect |
| TCP 443 | `0.0.0.0/0` | Public app/API HTTPS |
| UDP 443 | `0.0.0.0/0`, optional | Caddy HTTP/3 |

Keep the default outbound access initially so DNS, package downloads, HTTPS storage and SMTP submission work. Review all security groups attached to the instance: their permissions combine, so another group with broad SSH access would defeat the `/32` restriction. If using custom network ACLs, allow the required return traffic too.

Do **not** expose 3000, 5173, 5432, 6379, 8333, 8025, 1025 or Jenkins 8080. If your home IP changes, update the SSH rule before deploying again. AWS CLI credentials are not needed for the SSH-based Jenkins pipeline.

## 4. Launch the EC2 instance

1. EC2 → Instances → **Launch instances**; name it `capybudget-prod`.
2. Select Canonical's official **Ubuntu Server 24.04 LTS, 64-bit x86** AMI. Check the publisher and avoid Ubuntu Pro/Marketplace images with additional software charges.
3. Select **`m7i-flex.large`** only if the console marks it eligible and offers it in your selected region/account. Review the estimated hourly cost. If unavailable, compare eligible alternatives; do not silently switch to a paid-only type.
4. Create/download a dedicated administrator key pair, or import your existing public key. Keep the private key outside Git. On Linux/WSL, restrict its permissions with `chmod 600 ~/.ssh/your_admin_key`.
5. Select the public subnet, enable public IPv4 assignment, and attach `capybudget-web`.
6. Start with **40 GiB encrypted gp3 EBS storage**, default IOPS/throughput. This is a capacity suggestion, not a free storage entitlement; it consumes the applicable allowance/credits. Monitor image caches, database and receipt growth. Prefer the AWS-managed EBS encryption key unless you need a separate customer-managed key.
7. Require instance metadata version 2 (IMDSv2). Leave Spot, hibernation and optional detailed monitoring disabled for this simple deployment. Review disk deletion-on-termination settings and enable termination protection if available.
8. Confirm the launch summary and start **one** instance. Wait for EC2 status checks to pass. Record instance ID, region, AMI and public IPv4.

An automatically assigned public IPv4 can change after stop/start. For stable DNS, allocate and associate **one Elastic IP** if your plan permits it; otherwise update both DNS records, Jenkins `DEPLOY_HOST`, and its verified known-hosts file whenever the address changes. Never assume Elastic IP is free: AWS lists $0.005 per public IPv4-hour, whether attached or idle (about $3.65 for 730 hours before applicable benefits/credits). [AWS public IPv4 pricing](https://aws.amazon.com/vpc/pricing/).

These instructions use x86-64. If choosing T4g instead, choose an ARM64 Ubuntu AMI and build native ARM64 images on that instance. Never upload your laptop's `node_modules`. The same Docker templates build natively on either architecture.

## 5. Prepare Ubuntu

On your computer, replace `VPS_IP` and the key path:

Before accepting the first SSH connection, compare its host fingerprint with EC2 → select instance → Actions → Monitor and troubleshoot → Get system log. Find the matching SSH host-key fingerprint in that output. This is the server's identity, not your administrator key-pair fingerprint. [AWS host fingerprint instructions](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connection-prereqs-general.html).

```sh
ssh -i ~/.ssh/your_admin_key ubuntu@VPS_IP
```

On the VPS:

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git nano openssl util-linux
sudo timedatectl set-timezone UTC
```

Keep server clocks accurate for OTP, sessions and schedules. Users' display timezones remain app settings.

Install Docker Engine and the Compose plugin using Docker's **official Ubuntu apt-repository instructions**: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository). Select the repository installation method, add the signing key/repository, then install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin` and `docker-compose-plugin`. Do not install the legacy `docker-compose` Python package. Verify:

```sh
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker compose version
uname -m
```

On the recommended x86 instance, architecture should be `x86_64` (`aarch64` for T4g). Check both the EC2 security group and Ubuntu's existing iptables/nftables/UFW configuration. Preserve SSH and cloud metadata access. Permit 80/443 using the active firewall manager, then test from your computer. Docker-published ports can bypass UFW rules, so rely on the cloud perimeter plus publishing only intended ports. See [Docker firewall limitations](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations).

## 6. Create the deployment account

On the VPS as `ubuntu`:

```sh
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
sudo install -d -m 750 -o deploy -g deploy /opt/capybudget
sudo install -d -m 750 -o deploy -g deploy /opt/capybudget/releases
sudo install -d -m 700 -o deploy -g deploy /opt/capybudget/secrets
sudo -u deploy nano /home/deploy/.ssh/authorized_keys
```

Paste your administrator public key and the dedicated Jenkins public key as separate lines. See the [Jenkins guide](deployment-jenkins.md#ssh-credentials) for generating the latter. Then:

```sh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a **second** SSH session as `deploy` and confirm `docker ps` works before changing any SSH authentication settings. Keep the original administrator session open until this works. Docker-group membership is root-equivalent; this account must only be accessible with trusted keys.

Use key-only login and disable direct root SSH after verifying access. Apply OS security updates routinely and schedule reboots when needed. Swap can be an emergency buffer for builds, but should not be used to justify running the app on an undersized VM; protect swap with the same disk-encryption policy as the data.

## 7. Add DNS records

At the authoritative DNS provider for `bebem.my.id`, create:

| Type | Name within the `bebem.my.id` zone | Value |
| --- | --- | --- |
| A | `capybudget` | VPS public IPv4 |
| A | `api.capybudget` | Same VPS public IPv4 |

Use a short TTL such as 300 seconds during setup. If the provider asks for full names, enter `capybudget.bebem.my.id` and `api.capybudget.bebem.my.id`. Do not append the zone twice. Start with **DNS only** in Cloudflare. Remove stale AAAA records unless IPv6 is configured end to end.

Check resolution from your computer:

```sh
nslookup capybudget.bebem.my.id
nslookup api.capybudget.bebem.my.id
```

Caddy will obtain certificates when the application is deployed. A connection failure before Caddy starts is expected; a DNS answer pointing to the wrong IP is not.

## 8. Configure storage and outbound email

Follow [production secrets and services](deployment-jenkins.md#4-configure-production-secrets-on-the-vps): SeaweedFS stores live files privately on this VPS; an off-host S3 bucket stores encrypted backups and deletion tombstones. Retain encryption keys separately. A VPS snapshot alone does not replace the app's database/file-consistent recovery procedure.

Keep the guide's R2 backup destination unless you deliberately adapt the S3 configuration. Moving compute to AWS does not require moving object storage too. An Amazon S3 backup bucket is another option, but its IAM permissions, region and the current bucket-creation code path need review; do not simply replace the endpoint and assume compatibility.

For email, use a real authenticated SMTP provider. **Amazon SES is optional**, subject to account-plan availability, pricing and approval; do not assume EC2 credits include a permanent free email allowance.

If SES is available in your account:

1. In SES, select a supported region and verify the sending domain for `no-reply@capybudget.bebem.my.id`. Add the provided DKIM records and configure SPF/DMARC as appropriate for the chosen MAIL FROM domain.
2. Request production access in that region before allowing public signup. In the SES sandbox, recipient restrictions prevent sending OTPs to arbitrary new users. Approval is not automatic. [SES sandbox and production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).
3. Generate regional **SES SMTP credentials**. These differ from your AWS console password and ordinary AWS access keys. Copy the SMTP endpoint shown for that region. [SES SMTP credentials](https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html).
4. Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and the verified `EMAIL_FROM`. Use the provider's supported TLS submission settings, typically port 587 with `SMTP_SECURE=false` for STARTTLS, or 465 with `SMTP_SECURE=true`.
5. Confirm your plan can use SES, review its pricing/quotas, and test initial signup OTP, resend, reset-password and reminders through the email worker. If production access is unavailable, configure another SMTP provider before public signup.

Do not open inbound SMTP ports or run your own mail server on EC2. Mailpit remains local testing infrastructure and does not deliver real external mail.

## 9. Deploy and prove recovery

Continue with [local Jenkins setup and first deployment](deployment-jenkins.md#6-start-jenkins-locally-named-jenkins). Before inviting users:

1. Complete the real user-flow checks in that guide, including first signup email, receipts, PDFs, forecast worker and privacy export/deletion.
2. Verify off-host backup upload and a successful isolated restore with the complete encryption keyring.
3. Review the documented bootstrap database-role and S3 bucket-creation permissions; complete least-privilege hardening for a public multi-user deployment.
4. Configure independent uptime checks for both domains and alerts for backup/job failures. Jenkins cannot notify you when your computer is off unless you add an independent monitoring service.
5. Record how to recreate the VPS from the repository, restore data, update DNS, and reconnect Jenkins. Store this runbook and secrets securely outside the VPS.

## 10. Monitor credits and prepare for expiry

| Item | What to monitor |
| --- | --- |
| EC2 | Region-specific hourly cost and hours running; two instances consume the same credit pool faster |
| EBS | Allocated disk, snapshots and retained volumes; these can continue costing money while EC2 is stopped |
| Public IPv4 | Attached and idle address-hours, including Elastic IPs |
| Network | Data transfer and accidental NAT Gateway/load balancer charges |
| Object storage/email | Provider storage, requests and sending limits; external R2 costs are separate from AWS credits |
| CPU credits | If choosing T3/T4g, review burst-credit mode and any surplus-credit charges |
| Account plan | Credit balance, expiry date, and whether the account is Free or Paid |
| Domain | Existing domain renewal is separate from hosting |

Review Billing daily during the first week, then at least weekly. Set calendar reminders well before credit/plan expiry. A Free plan is time-limited; do not rely on the service remaining available after it ends. Upgrading to Paid changes the billing risk and should be a deliberate decision.

Before ending the trial, download a verified off-host backup and retain the encryption keys, DNS settings and deployment runbook. Either move to another host or choose paid hosting. To stop using AWS, remove resources only after recovery is confirmed: terminate the instance, review retained EBS volumes/snapshots, release unused Elastic IPs, and inspect other regions/services for remaining resources. Stopping EC2 alone does not stop all costs. Never delete the only copy of your financial data or encryption keys.
