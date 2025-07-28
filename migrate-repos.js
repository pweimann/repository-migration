#!/usr/bin/env node

import { Octokit } from '@octokit/core';
import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';

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
            console.log(`📋 Listing repositories from organization: ${org}`);

            const response = await this.octokit.request('GET /orgs/{org}/repos', {
                org: org,
                type: 'all',
                per_page: 100,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });

            console.log(`✅ Found ${response.data.length} repositories in ${org}`);
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

        console.log(`🔄 ${this.dryRun ? '[DRY RUN] ' : ''}Transferring: ${repoFullName} → ${this.targetOrg}/${repoName}`);

        if (this.dryRun) {
            console.log(`✅ [DRY RUN] Would transfer ${repoFullName}`);
            this.results.successful.push({
                repo: repoFullName,
                target: `${this.targetOrg}/${repoName}`,
                dryRun: true,
                timestamp: new Date().toISOString()
            });
            return { success: true, dryRun: true };
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

            console.log(`✅ Successfully transferred: ${repoFullName}`);
            this.results.successful.push({
                repo: repoFullName,
                target: `${this.targetOrg}/${repoName}`,
                timestamp: new Date().toISOString(),
                response: response.status
            });

            return { success: true, response };
        } catch (error) {
            console.error(`❌ Failed to transfer ${repoFullName}:`, error.message);
            this.results.failed.push({
                repo: repoFullName,
                error: error.message,
                status: error.status,
                timestamp: new Date().toISOString()
            });

            return { success: false, error };
        }
    }

    /**
     * Validates prerequisites before migration
     */
    async validateSetup() {
        console.log('🔍 Validating setup...');

        // Check authentication
        try {
            const user = await this.octokit.request('GET /user');
            console.log(`✅ Authenticated as: ${user.data.login}`);
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }

        // Check target organization exists
        try {
            const org = await this.octokit.request('GET /orgs/{org}', {
                org: this.targetOrg
            });
            console.log(`✅ Target organization exists: ${this.targetOrg}`);
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
            console.log(`✅ Sufficient permissions for target organization`);
        } catch (error) {
            console.warn(`⚠️  Could not verify permissions for target org: ${error.message}`);
        }
    }

    /**
     * Migrates repositories from source organizations loaded from JSON file
     */
    async migrateFromFile(filePath) {
        try {
            const repos = JSON.parse(readFileSync(filePath, 'utf8'));
            console.log(`📁 Loaded ${repos.length} repositories from ${filePath}`);

            for (const repo of repos) {
                // Extract org from the repo URL or SSH URL
                const orgMatch = repo.url.match(/github\.com\/([^\/]+)\//) ||
                    repo.sshUrl.match(/github\.com:([^\/]+)\//);

                if (!orgMatch) {
                    console.warn(`⚠️  Could not determine organization for ${repo.name}`);
                    continue;
                }

                const sourceOrg = orgMatch[1];
                await this.transferRepository(repo, sourceOrg);

                // Rate limiting - wait 1 second between transfers
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(`❌ Error reading file ${filePath}:`, error.message);
        }
    }

    /**
     * Migrates all repositories from specified source organizations
     */
    async migrateFromOrganizations(sourceOrgs) {
        for (const sourceOrg of sourceOrgs) {
            console.log(`\n🏢 Processing organization: ${sourceOrg}`);

            const repos = await this.listRepositories(sourceOrg);

            for (const repo of repos) {
                await this.transferRepository(repo, sourceOrg);

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

        console.log('\n📊 MIGRATION SUMMARY');
        console.log('═══════════════════');
        console.log(`Total repositories: ${this.results.summary.total}`);
        console.log(`✅ Successful: ${this.results.summary.successful}`);
        console.log(`❌ Failed: ${this.results.summary.failed}`);
        console.log(`⏭️  Skipped: ${this.results.summary.skipped}`);
        console.log(`📈 Success rate: ${this.results.summary.successRate.toFixed(1)}%`);
        console.log(`📝 Detailed log saved to: ${this.logFile}`);

        if (this.dryRun) {
            console.log('\n🔍 This was a DRY RUN - no actual transfers were performed');
            console.log('Set dryRun: false to execute actual transfers');
        }
    }

    /**
     * Main execution method
     */
    async run() {
        console.log('🚀 GitHub Repository Migration Script');
        console.log('====================================\n');

        try {
            await this.validateSetup();

            // Check if we have a JSON file with repos or should scan organizations
            if (existsSync('test-repos.json')) {
                console.log('\n📁 Found test-repos.json - migrating from file');
                await this.migrateFromFile('test-repos.json');
            } else if (this.sourceOrgs.length > 0) {
                console.log(`\n🏢 Migrating from organizations: ${this.sourceOrgs.join(', ')}`);
                await this.migrateFromOrganizations(this.sourceOrgs);
            } else {
                throw new Error('No source organizations specified and no repos file found');
            }

            this.generateReport();

        } catch (error) {
            console.error('💥 Migration failed:', error.message);
            process.exit(1);
        }
    }
}

function existsSync(path) {
    try {
        readFileSync(path);
        return true;
    } catch {
        return false;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🔒 Target organization is configured via .env file only for security');

    const migrator = new RepositoryMigrator({
        dryRun: !process.argv.includes('--execute')
    });

    migrator.run();
}

export { RepositoryMigrator };
