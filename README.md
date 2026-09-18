# Bole Coupons

Bole Digital Coupon System. Develop a full-stack web application to digitize meal coupon management for an office cafeteria serving 2,000 employees. The system replaces physical paper coupons with dynamic, scanner-based QR codes and role-based account management. Core Business Rules & Rules Engine Target Audience: Employees, Cashiers, Auditors, and Super Admin. Weekly Allowance: 200 Birr per employee per week (5 coupons $\times$ 40 Birr/day).Operating Days: Monday through Friday only (No service on Saturday or Sunday).Flexible Redemption: Employees can redeem their daily allowance (40 Birr) or combine coupons to redeem multiple days at once (40, 80, 120, 160, or 200 Birr) in a single transaction. First-Login Security: Accounts created by the Super Admin must enforce a mandatory password reset upon initial login. Key Roles & Account Workflow Super Admin (First-Time Setup & Management):Bootstrap initial system access by creating the primary Super Admin account. Bulk-create initial user credentials (Username + Temporary Password) for 2,000 Employees, 5 Cashiers, and 2 Auditors. Perform weekly approvals: Confirm employee eligibility and allocate/approve coupon values (up to 200 Birr) for the upcoming week. Employees: Forced password reset on first login. Dashboard view showing active weekly balance. Interactive QR Generator allowing selection of deduction amount: 40, 80, 120, 160, or 200 Birr. Instant QR code rendering based on the selected Birr value. Cashiers (5 Accounts):Mobile/Tablet interface using the device camera as a high-speed QR code scanner. Real-time validation: Verifies token validity, checks available balance, deducts the chosen amount, and logs the transaction instantly. Auditors (2 Accounts):Read-only analytics dashboard for financial monitoring, redemption tracking, and system audit logs.

there will be a separate user account for each user. all user accounts are crated by the admin, the only user allowed to crate its own account is the admin. admins initial user name is admin and password is Admin@123. casher side camera scanner is not working. when the camera symbol is touched request the mobile app to enable camera access for the site.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bolecoupon.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b69987eb-037c-49bc-92ac-1debecb78cbe).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
