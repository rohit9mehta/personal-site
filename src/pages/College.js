import React from 'react';
import { Link } from 'react-router-dom';

import Main from '../layouts/Main';

const College = () => (
  <Main
    title="College"
    description="College Help"
  >
    <article className="post" id="college">
      <header>
        <div className="title">
          <h2 data-testid="heading"><Link to="/college">College Essay Reviews and Zoom Chats</Link></h2>
        </div>
      </header>
      <div>
        Hello everyone! My name is Rohit Mehta, and
        I’m an Electrical Engineering and Computer Sciences student at UC Berkeley.
        In the 2019 admissions cycle, I was admitted to 10 schools including UC Berkeley,
        UCLA, UC Davis (Regents), UC Irvine, and University of Michigan,
        all for Computer Science in the respective Engineering Departments.
      </div>
      <br />
      <div>
        I’m a Santa Rosa native: went to <b>Whited Elementary</b>,
        then to <b>Rincon Valley Charter</b>, and finally to <b>Maria Carrillo</b>,
        so I know firsthand how intimidating transitioning from our
        middle and high schools to a competitive major
        (less than 5% acceptance rate in my case)
        at a leading university can be. If I’m being honest,
        I didn’t really begin to feel like I fit into Berkeley
        until more than halfway through freshman year, and
        conversations with my peers at other leading universities
        have revealed that they’ve faced similar issues. Giving back
        to the community that brought me to where I am today has
        long been something I wanted to do, and armed with my hyperlocal
        Sonoma County-based experience of navigating college admissions and
        readiness, I want to help our next generation of scholars truly
        excel from the get-go.
      </div>
      <br />
      <div>
        I’m happy to announce that I’ll be offering college essay review
        services as well as 20 minute Zoom chats on career/college planning
        (as specific or general as you’d like!) for the rest of this summer
        into September. Essay review slots and Zoom sessions will be limited
        and given out on a first-come-first-serve basis. Details and pricing
        are on my website! Feel free to reach out either through the contact
        form on the website or by emailing me at rohit9mehta@berkeley.edu
      </div>
      <br />
      <div>
        <b>College Essay Review</b>
      </div>
      <br />
      <div>
        I will meticulously review, annotate, and provide personalized,
        extensive written feedback on your college essays
        (either Common/Coalition App or specific to colleges).
        <br />
        <br />
        Pricing (by the hour, prorated): <b>$199</b>
      </div>
      <br />
      <div>
        <b>Zoom Chats</b>
      </div>
      <br />
      <div>
        On the topic of your choice! I can offer valuable advice for
        college in general, specific to a major or career choice, insight
        into my experiences applying to college, or anything else! Do
        drop me a quick email at least 24 hours prior to our scheduled meeting
        letting me know what you’d wish to chat about so I may prepare
        as well as possible :)
        <br />
        <br />
        Pricing (by 20 minutes, prorated): <b>$79</b>
      </div>
    </article>
  </Main>
);

export default College;
