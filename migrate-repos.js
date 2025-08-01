#!/usr/bin/env node

import {Octokit} from '@octokit/core';
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

        this.targetOrg = process.env.TARGET_ORG;
        if (!this.targetOrg) {
            throw new Error('TARGET_ORG environment variable is required. Please set it in your .env file.');
        }

        this.sourceOrgs = process.env.SOURCE_ORGS?.split(',') || [];
        this.dryRun = options.dryRun !== undefined ? options.dryRun : true;
        this.stopOnFailure = true;

        this.results = {
            successful: [],
            failed: [],
            skipped: [],
            summary: {}
        };
    }

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

    async migrateFromOrganizations(sourceOrgs) {
        for (const sourceOrg of sourceOrgs) {
            const repos = await this.listRepositories(sourceOrg);
            console.log(`Migrating ${repos.length} repositories from ${sourceOrg}...`);

            for (const repo of repos) {
                const result = await this.transferRepository(repo, sourceOrg);

                if (!result.success && !this.dryRun) {
                    throw new Error(`Migration stopped due to failure`);
                }

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async run() {
        console.log(`🚀 Migration to ${this.targetOrg} ${this.dryRun ? '(DRY RUN)' : ''}`);
        if (!this.dryRun && this.stopOnFailure) {
            console.log('⚠️  Stop-on-failure enabled - migration will abort on first error');
        }

        try {
            if (this.sourceOrgs.length > 0) {
                console.log(`Migrating from: ${this.sourceOrgs.join(', ')}`);
                await this.migrateFromOrganizations(this.sourceOrgs);
            } else {
                throw new Error('No source organizations specified');
            }

        } catch (error) {
            console.error('❌ Migration failed:', error.message);

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
