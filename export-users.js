#!/usr/bin/env node

import { Octokit } from '@octokit/core';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';

config();

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const sourceOrgs = process.env.SOURCE_ORGS?.split(',') || [];
const allUsers = [];

for (const org of sourceOrgs) {
    try {
        const response = await octokit.request('GET /orgs/{org}/members', {
            org: org.trim(),
            per_page: 100
        });

        allUsers.push(...response.data.map(user => ({
            email: user.email,
            name: user.name,
            login: user.login,
            id: user.id,
            organization: org.trim()
        })));
    } catch (error) {
        // Silent continue on error
    }
}

writeFileSync('users.json', JSON.stringify(allUsers, null, 2)); 