#!/usr/bin/env node

import {Octokit} from '@octokit/core';
import {writeFileSync} from 'fs';
import {config} from 'dotenv';

config();

/**
 * GitHub Repository Migration Script
 * Migrates repositories from multiple source organizations to a target organization
 */
class RepositoryMigrator {
    constructor(options = {}) {
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
            userAgent: 'senacor-migration-script/1.0.0'
        });

        // Target organization MUST be set via environment variable for security
        this.targetOrg = process.env.TARGET_ORG;
        if (!this.targetOrg) {
            throw new Error('TARGET_ORG environment variable is required. Please set it in your .env file.');
        }

        this.sourceOrgs = process.env.SOURCE_ORGS?.split(',') || [];
        this.dryRun = options.dryRun !== undefined ? options.dryRun : true;
        this.logFile = `migration-log-${new Date().toISOString().split('T')[0]}.json`;
        this.stopOnFailure = true;

        this.results = {
            successful: [],
            failed: [],
            skipped: [],
            summary: {}
        };
    }

    /**
     * Lists all repositories from a source organization
     */
    async listRepositories(org) {
        try {
            const response = await this.octokit.request('GET /orgs/{org}/repos', {
                org: org,
                type: 'all',
                per_page: 100,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            return response.data;
        } catch (error) {
            console.error(`❌ Error listing repositories for ${org}:`, error.message);
            return [];
        }
    }

    /**
     * Transfers a single repository to the target organization
     */
    async transferRepository(repo, sourceOrg) {
        const repoName = repo.name;
        const repoFullName = `${sourceOrg}/${repoName}`;

        if (this.dryRun) {
            this.results.successful.push({
                repo: repoFullName,
                target: `${this.targetOrg}/${repoName}`,
                dryRun: true,
                timestamp: new Date().toISOString()
            });
            return {success: true, dryRun: true};
        }

        try {
            const response = await this.octokit.request('POST /repos/{owner}/{repo}/transfer', {
                owner: sourceOrg,
                repo: repoName,
                new_owner: this.targetOrg,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            console.log(`✅ ${repoFullName} → ${this.targetOrg}`);
            this.results.successful.push({
                repo: repoFullName,
                target: `${this.targetOrg}/${repoName}`,
                timestamp: new Date().toISOString(),
                response: response.status
            });

            return {success: true, response};
        } catch (error) {
            console.error(`❌ ${repoFullName}: ${error.message}`);
            this.results.failed.push({
                repo: repoFullName,
                error: error.message,
                status: error.status,
                timestamp: new Date().toISOString()
            });

            if (!this.dryRun && this.stopOnFailure) {
                throw new Error(`Migration failed for ${repoFullName}: ${error.message}`);
            }

            return {success: false, error};
        }
    }

    /**
     * Validates prerequisites before migration
     */
    async validateSetup() {
        // Check authentication
        try {
            const user = await this.octokit.request('GET /user');
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }

        // Check target organization exists
        try {
            await this.octokit.request('GET /orgs/{org}', {
                org: this.targetOrg
            });
        } catch (error) {
            throw new Error(`Target organization '${this.targetOrg}' not found or no access`);
        }

        // Check permissions for target org
        try {
            const membership = await this.octokit.request('GET /orgs/{org}/memberships/{username}', {
                org: this.targetOrg,
                username: (await this.octokit.request('GET /user')).data.login
            });

            if (!['admin', 'owner'].includes(membership.data.role)) {
                throw new Error(`Insufficient permissions for target org. Need admin/owner, have: ${membership.data.role}`);
            }
        } catch (error) {
            // Silently continue if we can't verify permissions
        }
    }

    /**
     * Migrates all repositories from specified source organizations
     */
    async migrateFromOrganizations(sourceOrgs) {
        for (const sourceOrg of sourceOrgs) {
            const repos = await this.listRepositories(sourceOrg);
            console.log(`Migrating ${repos.length} repositories from ${sourceOrg}...`);

            for (const repo of repos) {
                const result = await this.transferRepository(repo, sourceOrg);

                if (!result.success && !this.dryRun) {
                    throw new Error(`Migration stopped due to failure`);
                }

                // Rate limiting - wait 1 second between transfers
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    /**
     * Generates migration summary and saves results
     */
    generateReport() {
        this.results.summary = {
            total: this.results.successful.length + this.results.failed.length + this.results.skipped.length,
            successful: this.results.successful.length,
            failed: this.results.failed.length,
            skipped: this.results.skipped.length,
            successRate: this.results.successful.length / (this.results.successful.length + this.results.failed.length) * 100,
            timestamp: new Date().toISOString(),
            dryRun: this.dryRun
        };

        // Save detailed log
        writeFileSync(this.logFile, JSON.stringify(this.results, null, 2));

        console.log(`\n📊 SUMMARY: ${this.results.summary.successful}/${this.results.summary.total} successful (${this.results.summary.successRate.toFixed(1)}%)`);
        if (this.results.summary.failed > 0) {
            console.log(`❌ ${this.results.summary.failed} failed transfers`);
        }
        console.log(`📝 Log: ${this.logFile}`);

        if (this.dryRun) {
            console.log('🔍 DRY RUN - use --execute for actual transfers');
        }
    }

    /**
     * Main execution method
     */
    async run() {
        console.log(`🚀 Migration to ${this.targetOrg} ${this.dryRun ? '(DRY RUN)' : ''}`);
        if (!this.dryRun && this.stopOnFailure) {
            console.log('⚠️  Stop-on-failure enabled - migration will abort on first error');
        }

        try {
            await this.validateSetup();

            if (this.sourceOrgs.length > 0) {
                console.log(`Migrating from: ${this.sourceOrgs.join(', ')}`);
                await this.migrateFromOrganizations(this.sourceOrgs);
            } else {
                throw new Error('No source organizations specified');
            }

            this.generateReport();

        } catch (error) {
            console.error('❌ Migration failed:', error.message);

            this.generateReport();
            process.exit(1);
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const migrator = new RepositoryMigrator({
        dryRun: !process.argv.includes('--execute'),
    });

    migrator.run();
}

export {RepositoryMigrator};
